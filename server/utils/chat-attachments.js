export function resolveProjectPathFromRow(project) {
    if (!project || typeof project !== 'object') {
        return null;
    }

    return project.project_path || project.fullPath || project.path || null;
}

export function appendAttachmentPathsToPrompt(command, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return command;
    }

    const validAttachments = attachments.filter((attachment) => (
        attachment &&
        typeof attachment.path === 'string' &&
        attachment.path.trim().length > 0
    ));

    if (validAttachments.length === 0) {
        return command;
    }

    const fileList = validAttachments
        .map((attachment) => `- ${attachment.path}`)
        .join('\n');

    return `${command}\n\n[Files provided at the following paths:]\n${fileList}`;
}
