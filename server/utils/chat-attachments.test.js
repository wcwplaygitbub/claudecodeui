import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProjectPathFromRow } from './chat-attachments.js';

test('resolveProjectPathFromRow reads database project_path rows', () => {
    const projectPath = resolveProjectPathFromRow({
        project_id: 'project-1',
        project_path: '/workspace/project-1',
    });

    assert.equal(projectPath, '/workspace/project-1');
});
