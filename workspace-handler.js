// needs to handle workspace switching, and workspace creation
// also needs to handle workspace deletion, and workspace renaming

// this file will be used to handle all workspace related actions, such as switching, creating, deleting, and renaming workspaces

document.addEventListener('DOMContentLoaded', () => {
    // get the workspace select element
    const workspaceSelect = document.getElementById('workspace-select');
    // get the create workspace button
    const createWorkspaceButton = document.getElementById('create-workspace-button');
    // get the delete workspace button
    const deleteWorkspaceButton = document.getElementById('delete-workspace-button');
    // get the rename workspace button
    const renameWorkspaceButton = document.getElementById('rename-workspace-button');
    
    // add event listener for workspace switching
    workspaceSelect.addEventListener('change', (event) => {
        const selectedWorkspace = event.target.value;
        // switch to the selected workspace
        switchWorkspace(selectedWorkspace);
    });

    // add event listener for workspace creation
    createWorkspaceButton.addEventListener('click', () => {
        // prompt the user for the new workspace name
        const newWorkspaceName = prompt('Enter the name of the new workspace:');
        if (newWorkspaceName) {
            // create the new workspace
            createWorkspace(newWorkspaceName);
        }
    });

    // add event listener for workspace deletion
    deleteWorkspaceButton.addEventListener('click', () => {
        // get the currently selected workspace        const selectedWorkspace = workspaceSelect.value;
        const selectedWorkspace = workspaceSelect.value;
        if (selectedWorkspace) {
            // confirm the deletion
            const confirmDeletion = confirm(`Are you sure you want to delete the workspace "${selectedWorkspace}"?`);
            if (confirmDeletion) {
                // delete the selected workspace
                deleteWorkspace(selectedWorkspace);
            }
        } else {
            alert('Please select a workspace to delete.');
        }
    });
    
    // add event listener for workspace renaming
    renameWorkspaceButton.addEventListener('click', () => {
        // get the currently selected workspace       const selectedWorkspace = workspaceSelect.value;
        const selectedWorkspace = workspaceSelect.value;
        if (selectedWorkspace) {
            // prompt the user for the new workspace name
            const newWorkspaceName = prompt('Enter the new name for the workspace:', selectedWorkspace);
            if (newWorkspaceName) {
                // rename the selected workspace
                renameWorkspace(selectedWorkspace, newWorkspaceName);
            }
        } else {
            alert('Please select a workspace to rename.');
        }
    });
});

function switchWorkspace(workspaceName) {
    // logic to switch to the selected workspace
    console.log(`Switching to workspace: ${workspaceName}`);
}

function createWorkspace(workspaceName) {
    // logic to create a new workspace
    console.log(`Creating workspace: ${workspaceName}`);
}

function deleteWorkspace(workspaceName) {
    // logic to delete the selected workspace
    console.log(`Deleting workspace: ${workspaceName}`);
}

function renameWorkspace(oldName, newName) {
    // logic to rename the selected workspace
    console.log(`Renaming workspace from "${oldName}" to "${newName}"`);
}

createWorkspaceButton.addEventListener('click', () => {
    window.location.href = 'workspacecreate.html';
});