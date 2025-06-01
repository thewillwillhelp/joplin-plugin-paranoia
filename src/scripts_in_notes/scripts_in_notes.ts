import joplin from 'api';

const PLUGINS_NOTEBOOK_ID = '__plugins';
const PARANOIA_NOTEBOOK_ID = 'Paranoia';

async function saveCurrentNote(noteText: string) {
    try {
        const versionInfo = await joplin.versionInfo();
        const selectedNote = await joplin.workspace.selectedNote();
        if (versionInfo && versionInfo.platform === 'mobile') {
            if (!selectedNote) {
                return;
            }

            await joplin.commands.execute('editor.setText', noteText);
        } else {
            await joplin.data.put(['notes', selectedNote.id], null, {
                body: noteText,
            });
        }
    } catch (error) {
        console.error('Failed to save note:', error);
    }
}

export async function loadDefaultPluginScript() {
    // Fetch all notebooks
    let allNotebooks = [];
    let page = 1;
    const maxPage = 10;
    do {
        const response = await joplin.data.get(['folders'], {
            fields: ['id', 'title', 'parent_id'],
            page: page,
        });
        allNotebooks.push(...response.items);
        if (!response.has_more) break;
        page++;
    } while (page < maxPage);
    console.info('All Notebooks:', allNotebooks);

    let pluginsNotebook = allNotebooks.find(
        (nb) => nb.parent_id === '' && nb.title === PLUGINS_NOTEBOOK_ID
    );

    if (!pluginsNotebook) {
        console.log('No plugins notebook found');

        pluginsNotebook = await joplin.data.post(['folders'], null, {
            title: PLUGINS_NOTEBOOK_ID,
        });
    }

    let paranoiaNotebook = allNotebooks.find(
        (nb) =>
            nb.parent_id === pluginsNotebook.id &&
            nb.title === PARANOIA_NOTEBOOK_ID
    );

    if (!paranoiaNotebook) {
        console.log('No paranoia notebook found');

        paranoiaNotebook = await joplin.data.post(['folders'], null, {
            title: PARANOIA_NOTEBOOK_ID,
            parent_id: pluginsNotebook.id,
        });
    }

    const paranoiaNotes = await joplin.data.get(
        ['folders', paranoiaNotebook.id, 'notes'],
        {
            fields: [
                'id',
                'title',
                'body',
                'parent_id',
                'updated_time',
                'created_time',
            ], // Added more fields for notes
        }
    );

    let paranoiaNote;

    if (paranoiaNotes.items.length < 1) {
        paranoiaNote = await joplin.data.post(['notes'], null, {
            title: 'default',
            parent_id: paranoiaNotebook.id,
        });
        paranoiaNote = await joplin.data.get(['notes', paranoiaNote.id], {
            fields: ['body'],
        });
    } else {
        paranoiaNote = paranoiaNotes.items[0];
    }

    try {
        eval(paranoiaNote.body);
    } catch (error) {
        console.log(error);
    }
}

function clearOutput(noteBody: string) {
    const outputSections = noteBody.match(
        /(```paranoia_script_output([^\n]*)([^]*?)```\n?)/g
    );

    if (!outputSections) {
        return noteBody;
    }

    let updatedBody = noteBody;
    for (let i = 0; i < outputSections.length; i++) {
        updatedBody = updatedBody.replace(outputSections[i], '');
    }

    return updatedBody;
}

export async function clearScriptsOutputInNote() {
    try {
        const selectedNote = await joplin.workspace.selectedNote();
        let updatedBody = clearOutput(selectedNote.body);

        await saveCurrentNote(updatedBody);
    } catch (error) {
        alert(error);
    }
}

export async function safePlayScriptsInNote() {
    try {
        await playScriptsInNote();
    } catch (error) {
        alert(error);
    }
}

export async function playScriptsInNote() {
    const selectedNote = await joplin.workspace.selectedNote();
    let updatedBody = clearOutput(selectedNote.body);

    const innerScriptsSections = updatedBody.match(
        /(```(js )?paranoia_script([^\n]*)\n([^]*?)```)/g
    );

    if (!innerScriptsSections) {
        return;
    }

    for (let i = 0; i < innerScriptsSections.length; i++) {
        let outputContent = '';
        const capturedLogs: string[] = [];
        const originalConsoleLog = console.log;

        // Override console.log to capture logs
        console.log = (...args: any[]) => {
            // Call the original console.log so logs still appear in the dev console
            originalConsoleLog.apply(console, args);
            // Capture logs for script output
            capturedLogs.push(
                args
                    .map((arg) => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg, null, 2);
                            } catch (e) {
                                return '[Unserializable Object]';
                            }
                        }
                        return String(arg);
                    })
                    .join(' ')
            );
        };

        try {
            const scriptBody = innerScriptsSections[i]
                .replace(/```(js )?paranoia_script/, '')
                .replace('```', '');

            const result = await eval(scriptBody);
            outputContent = `Eval Result:\n${result !== undefined ? result : 'undefined'}`;
        } catch (error) {
            originalConsoleLog(error); // Log the error to the main console
            outputContent = `Error:\n${error}`;
        } finally {
            // Restore original console.log
            console.log = originalConsoleLog;
        }

        if (capturedLogs.length > 0) {
            outputContent += `\n\nConsole Logs:\n${capturedLogs.join('\n')}`;
        }

        const outputBlock = `\`\`\`paranoia_script_output\n${outputContent}\n\`\`\``;
        updatedBody = updatedBody.replace(
            innerScriptsSections[i],
            innerScriptsSections[i] + '\n' + outputBlock
        );
    }

    await saveCurrentNote(updatedBody);
}
