import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

import { AppError } from '@/shared/utils.js';

const METADATA_IPV4 = '169.254.169.254';
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export type SafeOutboundRequestOptions = {
  method?: string;
  headers?: http.OutgoingHttpHeaders;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type SafeOutboundResponse = {
  status: number;
  ok: boolean;
  text: string;
  json: () => unknown;
};

const normalizeHostname = (hostname: string): string => hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/g, '');

const parseIpv4 = (address: string): number[] | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => Number(part));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
};

const isUnsafeIpv4 = (address: string): boolean => {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [first, second] = octets;

  return first === 0
    || first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
    || address === METADATA_IPV4;
};

const expandIpv6 = (address: string): number[] | null => {
  const withoutZone = address.split('%')[0].toLowerCase();
  const ipv4Match = withoutZone.match(/(.+:)(\d+\.\d+\.\d+\.\d+)$/);
  const normalized = ipv4Match
    ? `${ipv4Match[1]}${parseIpv4(ipv4Match[2])?.reduce<string[]>((acc, octet, index, octets) => {
      if (index % 2 === 0) acc.push(((octet << 8) + octets[index + 1]).toString(16));
      return acc;
    }, []).join(':') ?? ''}`
    : withoutZone;

  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0) return null;
  const pieces = [...left, ...Array(missing).fill('0'), ...right];
  if (pieces.length !== 8) return null;

  const groups = pieces.map((piece) => Number.parseInt(piece, 16));
  return groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
};

const ipv4FromMappedIpv6 = (groups: number[]): string | null => {
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!isMapped) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
};

const isUnsafeIpv6 = (address: string): boolean => {
  const groups = expandIpv6(address);
  if (!groups) return false;
  const [first] = groups;

  const mappedIpv4 = ipv4FromMappedIpv6(groups);
  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isUniqueLocal = (first & 0xfe00) === 0xfc00; // fc00::/7
  const isLinkLocal = (first & 0xffc0) === 0xfe80; // fe80::/10
  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal || (mappedIpv4 !== null && isUnsafeIpv4(mappedIpv4));
};

const isUnsafeIpAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return false;
};

const assertSafeHostLiteral = (hostname: string): void => {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) {
    throw new AppError('Outbound URL host is not allowed.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }

  if (isIP(normalized) && isUnsafeIpAddress(normalized)) {
    throw new AppError('Outbound URL host resolves to a private or local address.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }
};

const resolveSafeAddresses = async (hostname: string): Promise<LookupAddress[]> => {
  const normalized = normalizeHostname(hostname);
  assertSafeHostLiteral(normalized);

  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new AppError('Outbound URL host did not resolve.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }
  if (addresses.some(({ address }) => isUnsafeIpAddress(address))) {
    throw new AppError('Outbound URL host resolves to a private or local address.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }
  return addresses;
};

const parseSafeOutboundUrl = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError('Outbound URL is invalid.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Outbound URL must use http or https.', { code: 'UNSAFE_OUTBOUND_URL', statusCode: 400 });
  }
  return parsed;
};

const buildHostHeader = (url: URL): string => {
  if (!url.port) return url.hostname;
  return `${url.hostname}:${url.port}`;
};

const collectResponseText = (response: http.IncomingMessage, maxBytes: number): Promise<string> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  let total = 0;

  response.on('data', (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      response.destroy(new Error(`Response body exceeded ${maxBytes} bytes.`));
      return;
    }
    chunks.push(buffer);
  });
  response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  response.on('error', reject);
});

export async function assertSafeOutboundUrl(value: string): Promise<void> {
  const parsed = parseSafeOutboundUrl(value);
  await resolveSafeAddresses(parsed.hostname);
}

export async function safeOutboundRequest(value: string, options: SafeOutboundRequestOptions = {}): Promise<SafeOutboundResponse> {
  const parsed = parseSafeOutboundUrl(value);
  const isHttps = parsed.protocol === 'https:';
  const requestModule = isHttps ? https : http;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs;
  const hasDeadline = typeof timeoutMs === 'number' && timeoutMs > 0;
  let activeRequest: http.ClientRequest | undefined;
  let deadlineTimer: NodeJS.Timeout | undefined;

  const timeoutError = (): Error => new Error(`Request timed out after ${timeoutMs}ms.`);
  const deadline = hasDeadline
    ? new Promise<never>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        const error = timeoutError();
        activeRequest?.destroy(error);
        reject(error);
      }, timeoutMs);
    })
    : undefined;

  const withDeadline = async <T>(operation: Promise<T>): Promise<T> => {
    if (!deadline) return operation;
    return Promise.race([operation, deadline]);
  };

  try {
    const addresses = await withDeadline(resolveSafeAddresses(parsed.hostname));
    const address = addresses[0];

    const responseText = await withDeadline(new Promise<{ status: number; text: string }>((resolve, reject) => {
      const request = requestModule.request({
        protocol: parsed.protocol,
        host: address.address,
        hostname: address.address,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'GET',
        family: address.family,
        headers: {
          ...options.headers,
          Host: buildHostHeader(parsed),
        },
        ...(isHttps ? { servername: normalizeHostname(parsed.hostname) } : {}),
      }, async (response) => {
        try {
          const text = await collectResponseText(response, maxResponseBytes);
          resolve({ status: response.statusCode ?? 0, text });
        } catch (error) {
          reject(error);
        }
      });
      activeRequest = request;

      request.on('error', reject);
      if (hasDeadline) {
        request.setTimeout(timeoutMs, () => {
          request.destroy(timeoutError());
        });
      }
      request.end();
    }));

    return {
      status: responseText.status,
      ok: responseText.status >= 200 && responseText.status < 300,
      text: responseText.text,
      json: () => JSON.parse(responseText.text) as unknown,
    };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}
