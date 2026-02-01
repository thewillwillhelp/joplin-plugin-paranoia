import joplin from 'api';
import { UI } from './ui';

const SYNCED_FOLDER_NAME = '1. Synced';
const SYNCED_FOLDER_NAME_NEW = '1. Synced (1)';

async function getFolderId(name: string): Promise<string | null> {
    let page = 1;
    let response;
    do {
        response = await joplin.data.get(['folders'], {
            fields: ['id', 'title', 'parent_id'],
            page: page++,
        });
        const folder = response.items.find(
            (f: any) => f.title === name && f.parent_id === ''
        );
        if (folder) {
            return folder.id;
        }
    } while (response.has_more);
    return null;
}

async function getAllResources(rootFolderId: string): Promise<any[]> {
    const allFolders = [];
    let page = 1;
    let response;
    do {
        response = await joplin.data.get(['folders'], {
            fields: [
                'id',
                'title',
                'parent_id',
                'created_time',
                'updated_time',
            ],
            page: page++,
        });
        allFolders.push(...response.items);
    } while (response.has_more);

    const folderMap = new Map(allFolders.map((f) => [f.id, f]));
    const pathCache = new Map();

    function getPath(folderId: string): string {
        if (pathCache.has(folderId)) {
            return pathCache.get(folderId);
        }
        const path = [];
        let currentFolder = folderMap.get(folderId);
        while (currentFolder) {
            path.unshift(currentFolder.title);
            currentFolder = folderMap.get(currentFolder.parent_id);
        }
        const result = path.join('/');
        pathCache.set(folderId, result);
        return result;
    }

    const resources = [];
    const foldersToProcess = [rootFolderId];
    const processedFolders = new Set();

    while (foldersToProcess.length > 0) {
        const currentFolderId = foldersToProcess.pop();
        if (processedFolders.has(currentFolderId)) continue;
        processedFolders.add(currentFolderId);

        // Get notes in the current folder
        page = 1;
        do {
            response = await joplin.data.get(
                ['folders', currentFolderId, 'notes'],
                {
                    fields: [
                        'id',
                        'title',
                        'parent_id',
                        'created_time',
                        'updated_time',
                        'body',
                    ],
                    page: page++,
                }
            );
            for (const item of response.items) {
                const folderPath = getPath(item.parent_id);
                item.type = 'note';
                item.path = folderPath
                    ? `${folderPath}/${item.title}`
                    : item.title;
                resources.push(item);
            }
        } while (response.has_more);

        // Get sub-folders
        const subFolders = allFolders.filter(
            (f) => f.parent_id === currentFolderId
        );
        for (const item of subFolders) {
            const folderPath = getPath(item.parent_id);
            item.type = 'folder';
            item.path = folderPath ? `${folderPath}/${item.title}` : item.title;
            resources.push(item);
            foldersToProcess.push(item.id);
        }
    }
    return resources;
}

export async function sync() {
    UI.showMessage('Starting sync...');

    const syncedFolderId = await getFolderId(SYNCED_FOLDER_NAME);
    const syncedFolderNewId = await getFolderId(SYNCED_FOLDER_NAME_NEW);

    if (!syncedFolderId) {
        await UI.showMessage(
            `Error: Folder "${SYNCED_FOLDER_NAME}" not found.`
        );
        return;
    }
    if (!syncedFolderNewId) {
        await UI.showMessage(
            `Error: Folder "${SYNCED_FOLDER_NAME_NEW}" not found.`
        );
        return;
    }

    UI.showMessage(
        `Found folders: "${SYNCED_FOLDER_NAME}" and "${SYNCED_FOLDER_NAME_NEW}"`
    );

    const syncedResources = await getAllResources(syncedFolderId);
    const syncedNewResources = await getAllResources(syncedFolderNewId);

    const syncedResourcesMap = new Map(
        syncedResources.map((r) => [
            r.path.replace(`${SYNCED_FOLDER_NAME}/`, ''),
            r,
        ])
    );
    const syncedNewResourcesMap = new Map(
        syncedNewResources.map((r) => [
            r.path.replace(`${SYNCED_FOLDER_NAME_NEW}/`, ''),
            r,
        ])
    );

    const processedPaths = [];

    for (const [path, newResource] of syncedNewResourcesMap.entries()) {
        const oldResource = syncedResourcesMap.get(path);

        if (newResource.type !== 'note') continue; // Only process notes for now

        if (oldResource) {
            // 2-1) If notes has the same updated and created time, skip it
            if (
                newResource.updated_time === oldResource.updated_time &&
                newResource.created_time === oldResource.created_time
            ) {
                console.info(`Note "${path}" is identical. Skipping.`);
                processedPaths.push({
                    path,
                    status: 'identical',
                });

                continue;
            }

            // 2-2) If note from Synced (1) has newer updated time but the same created time
            if (
                newResource.created_time === oldResource.created_time &&
                newResource.updated_time > oldResource.updated_time
            ) {
                processedPaths.push({
                    path,
                    status: 'to_be_updated',
                });

                console.warn(
                    `Note "${path}" is newer in "${SYNCED_FOLDER_NAME_NEW}", but automatic update is disabled.`
                );
                continue;
            }

            // 2-3) If note from Synced (1) has older updated time, but the same created time
            if (
                newResource.created_time === oldResource.created_time &&
                newResource.updated_time < oldResource.updated_time
            ) {
                UI.showMessage(
                    `Note "${path}" is older. Kept in "${SYNCED_FOLDER_NAME_NEW}".`
                );

                processedPaths.push({
                    path,
                    status: 'both_modified',
                });
            }

            // 2-4) If note from Synced (1) has another created time
            if (newResource.created_time !== oldResource.created_time) {
                UI.showMessage(
                    `Note "${path}" has a different creation time. Kept in both folders.`
                );

                processedPaths.push({
                    path,
                    status: 'names_conflict',
                });
            }
        } else {
            // 2-5) if note is not existing in Synced (1) folder, move it there
            UI.showMessage(`Added new folder: "${path}"`);

            processedPaths.push({
                path,
                status: 'new_note',
            });
        }
    }

    // 2-5) if folder or note is not existing in Synced (1) folder,
    // add `__marked_to_remove` postfix to that in Synced and notify user
    for (const [path, oldResource] of syncedResourcesMap.entries()) {
        if (syncedNewResourcesMap.has(path)) {
            continue;
        }

        processedPaths.push({
            path,
            status: 'to_be_removed',
        });
    }

    console.log(processedPaths);

    const decisionsForms = await UI.showMessage(
        getSyncResultTable(processedPaths)
    );

    console.log('Decisions:', decisionsForms);

    if (decisionsForms.id !== 'ok') {
        await UI.showMessage('Sync cancelled by user.');
        return;
    }

    for (const item of processedPaths) {
        const newResource = syncedNewResourcesMap.get(item.path);
        const oldResource = syncedResourcesMap.get(item.path);
        const decisions = decisionsForms.formData['syncResultsForm'];
        const action = decisions[item.path];
        console.log('Processing item:', item, action, newResource, oldResource);

        if (item.status === 'to_be_updated') {
            if (action === 'accept') {
                await joplin.data.put(['notes', oldResource.id], null, {
                    body: newResource.body,
                });
                // await joplin.data.delete(['notes', newResource.id]);

                UI.addLogMessage(`Updated note: "${item.path}"`);
            } else {
                UI.addLogMessage(`Skipped updating note: "${item.path}"`);
            }
        } else if (
            item.status === 'both_modified' ||
            item.status === 'names_conflict'
        ) {
            if (action === 'save_both') {
                await joplin.data.put(['notes', newResource.id], null, {
                    title: `${newResource.title} (new)`,
                    parent_id: oldResource.parent_id,
                });

                UI.addLogMessage(`Kept both notes: "${item.path}"`);
            } else if (action === 'incoming') {
                await joplin.data.put(['notes', oldResource.id], null, {
                    body: newResource.body,
                });
                // await joplin.data.delete(['notes', newResource.id]);

                UI.addLogMessage(`Replaced with incoming note: "${item.path}"`);
            } else if (action === 'current') {
                // await joplin.data.delete(['notes', newResource.id]);

                UI.addLogMessage(
                    `Kept current note, removed incoming: "${item.path}"`
                );
            }
        } else if (item.status === 'to_be_removed') {
            if (action === 'skip') {
                continue;
            }

            if (action === 'mark') {
                const isAlreadyMarked =
                    oldResource.title.endsWith('__marked_to_remove');
                if (isAlreadyMarked) {
                    continue;
                }

                if (oldResource.type === 'note') {
                    await joplin.data.put(['notes', oldResource.id], null, {
                        title: `${oldResource.title}__marked_to_remove`,
                    });
                } else if (oldResource.type === 'folder') {
                    await joplin.data.put(['folders', oldResource.id], null, {
                        title: `${oldResource.title}__marked_to_remove`,
                    });
                }

                UI.addLogMessage(`Marked for removal: "${item.path}"`);
            } else if (action === 'accept') {
                if (oldResource.type === 'note') {
                    await joplin.data.delete(['notes', oldResource.id]);
                } else if (oldResource.type === 'folder') {
                    await joplin.data.delete(['folders', oldResource.id]);
                }

                UI.addLogMessage(`Removed: "${item.path}"`);
            }
        } else if (item.status === 'new_note') {
            const parentId = await createParentFoldersIfNeeded(
                item.path,
                syncedFolderId,
                syncedResourcesMap
            );

            await joplin.data.post(['notes'], null, {
                title: newResource.title,
                parent_id: parentId,
                body: newResource.body,
            });
            UI.addLogMessage(`Added new note: "${item.path}"`);
        }
    }

    await joplin.data.delete(['folders', syncedFolderNewId]);
    await UI.showMessage('Sync finished.');
}

async function createParentFoldersIfNeeded(
    path: string,
    syncedFolderId: string,
    syncedResourcesMap: Map<string, any>
): Promise<string> {
    const pathParts = path.split('/');
    pathParts.pop(); // Remove the note name

    let currentPath = '';
    let parentId = syncedFolderId;

    for (const part of pathParts) {
        currentPath += `${part}/`;
        const folderPath = currentPath.slice(0, -1); // Remove trailing slash

        let folderResource = syncedResourcesMap.get(folderPath);
        if (!folderResource) {
            // Create the folder
            console.log('want to create folder:', folderPath);

            const newFolder = await joplin.data.post(['folders'], null, {
                title: part,
                parent_id: parentId,
            });

            folderResource = {
                id: newFolder.id,
                title: part,
                parent_id: parentId,
                type: 'folder',
                path: folderPath,
            };
            syncedResourcesMap.set(folderPath, folderResource);
        }

        parentId = folderResource.id;
    }
    return parentId;
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'identical':
        case 'new_note':
            return 'green';
        case 'to_be_updated':
        case 'names_conflict':
            return 'amber';
        case 'both_modified':
        case 'to_be_removed':
            return 'red';
        default:
            return 'white';
    }
}

function getActionHtml(status: string, path: string): string {
    switch (status) {
        case 'to_be_updated':
            return `
                <label><input type="radio" name="${path}" value="accept" checked> Accept</label>
                <label><input type="radio" name="${path}" value="skip"> Skip</label>
            `;
        case 'both_modified':
        case 'names_conflict':
            return `
                <label><input type="radio" name="${path}" value="save_both" checked> Save both</label>
                <label><input type="radio" name="${path}" value="incoming"> Incoming</label>
                <label><input type="radio" name="${path}" value="current"> Current</label>
            `;
        case 'to_be_removed':
            return `
                <label><input type="radio" name="${path}" value="mark" checked> Mark</label>
                <label><input type="radio" name="${path}" value="skip"> Skip</label>
                <label><input type="radio" name="${path}" value="accept"> Accept</label>
            `;
        default:
            return 'no actions required';
    }
}

function getSyncResultTable(processedPaths: any[]): string {
    let table = `<h2>Sync Results</h2>
        <form name="syncResultsForm">
            <table border="1" cellpadding="5" cellspacing="0">
                <tr><th>Path</th><th>Status</th><th>Actions</th>
        </tr>`;
    for (const item of processedPaths) {
        table += `<tr>
            <td>${item.path}</td>
            <td><span style="color:${getStatusColor(item.status)}">${item.status}</span></td>
            <td>${getActionHtml(item.status, item.path)}</td>
        </tr>`;
    }
    table += '</table></form>';
    return table;
}
