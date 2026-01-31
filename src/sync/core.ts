import joplin from 'api';
import { diaflogs } from './ui';

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
                // 'body',
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
    // await diaflogs.showLogDialog();
    await diaflogs.addLogMessage('Starting sync...');

    const syncedFolderId = await getFolderId(SYNCED_FOLDER_NAME);
    const syncedFolderNewId = await getFolderId(SYNCED_FOLDER_NAME_NEW);

    if (!syncedFolderId) {
        await diaflogs.addLogMessage(
            `Error: Folder "${SYNCED_FOLDER_NAME}" not found.`
        );
        return;
    }
    if (!syncedFolderNewId) {
        await diaflogs.addLogMessage(
            `Error: Folder "${SYNCED_FOLDER_NAME_NEW}" not found.`
        );
        return;
    }

    await diaflogs.addLogMessage(
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
                continue;
            }

            // 2-2) If note from Synced (1) has newer updated time but the same created time
            if (
                newResource.created_time === oldResource.created_time &&
                newResource.updated_time > oldResource.updated_time
            ) {
                // const result = await joplin.views.dialogs.showMessageBox(
                //     `Note "${path}" has been updated. Do you want to replace the old one?`
                // );
                // if (result.response === 'ok') {
                //     await joplin.data.put(['notes', oldResource.id], null, {
                //         body: newResource.body,
                //     });
                //     await joplin.data.delete(['notes', newResource.id]);
                //     await diaflogs.addLogMessage(`Updated note: "${path}"`);
                // }
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
                await diaflogs.addLogMessage(
                    `Note "${path}" is older. Kept in "${SYNCED_FOLDER_NAME_NEW}".`
                );
            }

            // 2-4) If note from Synced (1) has another created time
            if (newResource.created_time !== oldResource.created_time) {
                await diaflogs.addLogMessage(
                    `Note "${path}" has a different creation time. Kept in both folders.`
                );
            }
        }
    }

    // 2-5) if folder is not existing in Synced (1) folder, add `__marked_to_remove` postfix to that folder in Synced and notify user
    for (const [path, oldResource] of syncedResourcesMap.entries()) {
        if (oldResource.type === 'folder' && !syncedNewResourcesMap.has(path)) {
            await joplin.data.put(['folders', oldResource.id], null, {
                title: `${oldResource.title}__marked_to_remove`,
            });
            await diaflogs.addLogMessage(
                `Marked folder for removal: "${path}"`
            );
        }

        if (oldResource.type === 'note' && !syncedNewResourcesMap.has(path)) {
            await joplin.data.put(['notes', oldResource.id], null, {
                title: `${oldResource.title}__marked_to_remove`,
            });
            await diaflogs.addLogMessage(`Marked note for removal: "${path}"`);
        }
    }

    await diaflogs.addLogMessage('Sync finished.');
}
