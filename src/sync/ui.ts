import joplin from 'api';

export namespace UI {
    let dialog: any;
    export async function createLogDialog() {
        if (dialog) {
            return;
        }

        dialog = await joplin.views.dialogs.create('sync-log-dialog');
        await joplin.views.dialogs.setHtml(
            dialog,
            `<div id="sync-log-content"></div>`
        );

        window['syncLogDialog'] = dialog;
    }

    export async function showLogDialog() {
        await joplin.views.dialogs.open(dialog);
    }

    export async function addLogMessage(message: string) {
        // We are using a script to append the message to the dialog
        // await joplin.views.dialogs.executeScript(dialog, `
        //     const logContent = document.getElementById('sync-log-content');
        //     const p = document.createElement('p');
        //     p.textContent = ${JSON.stringify(message)};
        //     logContent.appendChild(p);
        // `);
        console.log(message);
    }

    export async function showMessage(messageContent: string) {
        await createLogDialog();

        await joplin.views.dialogs.setHtml(dialog, messageContent);

        return showLogDialog();
    }
}
