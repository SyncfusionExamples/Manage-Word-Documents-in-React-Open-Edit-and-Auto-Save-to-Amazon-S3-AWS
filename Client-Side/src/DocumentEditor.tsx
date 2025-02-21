import React, { useRef, useState } from 'react';
import {
    CustomToolbarItemModel,
    DocumentEditorContainerComponent, Toolbar
} from '@syncfusion/ej2-react-documenteditor';
import AmazonS3FileManager from './AmazonS3FileManager.tsx';
import { ClickEventArgs } from '@syncfusion/ej2-navigations/src/toolbar/toolbar';
import { DialogUtility } from '@syncfusion/ej2-react-popups';

DocumentEditorContainerComponent.Inject(Toolbar);

function DocumentEditor() {
    // Backend API host URL for document operations
    const hostUrl: string = "http://localhost:62869/";
    // Reference to document editor container component
    const containerRef = useRef<DocumentEditorContainerComponent>(null);
    // Reference for dialog component
    let dialogObj: any;
    // State to hold the current document name
    const [currentDocName, setCurrentDocName] = useState<string>('None');
    // Track document modifications for auto-save functionality
    const contentChanged = React.useRef(false);

    // Custom toolbar button configuration for "New" document
    const newToolItem: CustomToolbarItemModel = {
        prefixIcon: "e-de-ctnr-new",
        tooltipText: "New",
        text: "New",
        id: "CustomNew"
    };

    // Custom toolbar button configuration for opening the Amazon S3 file manager
    const openToolItem: CustomToolbarItemModel = {
        prefixIcon: "e-de-ctnr-open",
        tooltipText: "Open Amazon S3 file manager",
        text: "Open",
        id: "OpenAmazonS3FileManager"
    };

    // Custom toolbar button configuration for downloading the document
    const downloadToolItem: CustomToolbarItemModel = {
        prefixIcon: "e-de-ctnr-download",
        tooltipText: "Download",
        text: "Download",
        id: "DownloadToLocal"
    };

    // Customize the SystemClipboard API name
    let settings = {systemClipboard: 'ProcessClipboardContent'}

    // Combined toolbar items including custom buttons and built-in features
    const toolbarItems = [newToolItem, openToolItem, downloadToolItem, 'Separator', 'Undo', 'Redo', 'Separator', 'Image', 'Table', 'Hyperlink', 'Bookmark', 'TableOfContents', 'Separator', 'Header', 'Footer', 'PageSetup', 'PageNumber', 'Break', 'InsertFootnote', 'InsertEndnote', 'Separator', 'Find', 'Separator', 'Comments', 'TrackChanges', 'Separator', 'LocalClipboard', 'RestrictEditing', 'Separator', 'FormFields', 'UpdateFields', 'ContentControl']

    // Automatically saves document to Amazon S3 storage
    const autoSaveDocument = async (): Promise<void> => {
        if (!containerRef.current) return;
        try {
            // Save as Blob using Docx format
            const blob: Blob = await containerRef.current.documentEditor.saveAsBlob('Docx');
            let exportedDocument = blob;
            let formData: FormData = new FormData();
            formData.append('documentName', containerRef.current.documentEditor.documentName);
            formData.append('data', exportedDocument);
            let req = new XMLHttpRequest();
            // Send document to backend API for Amazon S3 storage
            req.open(
                'POST',
                hostUrl + 'api/AmazonS3DocumentStorage/UploadDocument',
                true
            );
            req.onreadystatechange = () => {
                if (req.readyState === 4 && (req.status === 200 || req.status === 304)) {
                    // Auto save completed
                    // Success handler can be added here if needed
                }
            };
            req.send(formData);
        }
        catch (error) {
            console.error('Error saving document:', error);
        }
    };

    // Runs auto-save every second when content changes are detected
    React.useEffect(() => {
        const intervalId = setInterval(() => {
            if (contentChanged.current) {
                autoSaveDocument();
                contentChanged.current = false;
            }
        }, 1000);
        return () => clearInterval(intervalId);
    });

    // Handles document content change detection
    const handleContentChange = (): void => {
        contentChanged.current = true; // Set the ref's current value
    };

    // Handles document editor toolbar button click events
    const handleToolbarClick = async (args: ClickEventArgs): Promise<void> => {
        // Get a reference to the file manager open button
        const openButton = document.getElementById('openAmazonS3BucketStorage');
        // Get the current document name from the editor
        let documentName = containerRef.current?.documentEditor.documentName || 'Untitled';
        // Remove any extension from the document name using regex
        const baseDocName = documentName.replace(/\.[^/.]+$/, '');
        // Always check if containerRef.current exists before using it
        if (!containerRef.current) return;
        switch (args.item.id) {
            case 'OpenAmazonS3FileManager':
                // Programmatically trigger Amazon S3 file manager
                if (openButton) {
                    // Save the changes before opening a new document
                    await autoSaveDocument();
                    openButton.click();
                    // Sets the focus to the document editor within the current container reference
                    containerRef.current.documentEditor.focusIn();
                }
                break;
            case 'DownloadToLocal':
                // Initiate client-side download
                containerRef.current.documentEditor.save(baseDocName, 'Docx');
                // Sets the focus to the document editor within the current container reference
                containerRef.current.documentEditor.focusIn();
                break;
            case 'CustomNew':
                // If dialogObj exists, show the dialog; otherwise, prompt for a file name.
                if(dialogObj) {
                    dialogObj.show(); // Display the dialog.
                }
                else {
                    showFileNamePrompt(); // Prompt the user for a file name.
                }
                break;
            default:
                break;
        }
    };

    // Callback function to load file selected in the file manager
    const loadFileFromFileManager = (filePath: string, fileType: string, filenName: string): void => {
        if (!containerRef.current) {
            console.error('Document Editor is not loaded yet.');
            return;
        }
        containerRef.current.documentEditor.documentName = filenName;
        // Update state with the current document name
        setCurrentDocName(filenName);
        if (fileType === '.docx' || fileType === '.doc' || fileType === '.txt' || fileType === '.rtf') {
            // Handle document files
            fetch(hostUrl + 'api/AmazonS3DocumentStorage/FetchDocument', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                body: JSON.stringify({ documentName: filenName })
            })
                .then(response => {
                    if (response.status === 200 || response.status === 304) {
                        return response.json();
                    } else {
                        throw new Error('Error loading document');
                    }
                })
                .then(json => {
                    const documentEditorDiv = document.getElementById("document-editor-div")
                    if (documentEditorDiv) {
                        documentEditorDiv.style.display = "block";
                    }
                    // Open the document using the JSON data received
                    containerRef.current.documentEditor.open(JSON.stringify(json));
                })
                .catch(error => {
                    console.error('Error loading document:', error);
                });
        } else {
            alert('The selected file type is not supported for the document editor.');
        }
    };

    // List of default general document names
    const defaultFilenames = ['Untitled'];
    // Utility function to get a random default name from the list
    const getRandomDefaultName = (): string => {
        const randomIndex = Math.floor(Math.random() * defaultFilenames.length);
        return defaultFilenames[randomIndex];
    };

    //  Document existence to check if a document with a given name already exists on the backend
    const checkDocumentExistence = async (filename: string): Promise<boolean> => {
        try {
            const response = await fetch(hostUrl + 'api/AmazonS3DocumentStorage/CheckDocumentExistence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                body: JSON.stringify({ fileName: filename })
            });
            if (response.ok) {
                const result = await response.json();
                return result.exists; // Backend returns { exists: boolean }
            }
            return false;
        } catch (err) {
            console.error('Error checking document existence:', err);
            return false;
        }
    };

    // Prompt dialog for entering a new document filename
    const showFileNamePrompt = (errorMessage?: string) => {
        const randomDefaultName = getRandomDefaultName();
        dialogObj = DialogUtility.confirm({
            title: 'New Document',
            width: '350px',
            cssClass: 'custom-dialog-prompt',
            content: `
                <p>Enter document name:</p> 
                <div id="errorContainer" style="color: red; margin-top: 4px;">
                ${errorMessage ? errorMessage : ''}
                </div>
                <input id="inputEle" type="text" class="e-input" value="${randomDefaultName}"/>
            `,
            okButton: { click: handleFileNamePromptOk },
            cancelButton: { click: handleFileNamePromptCancel },
        });
        // After the dialog renders, focus and select the input text.
        setTimeout(() => {
            const input = document.getElementById("inputEle") as HTMLInputElement;
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        dialogObj.close = () => {
            setTimeout(() => {
                // Sets the focus to the document editor within the current container reference
                containerRef.current.documentEditor.focusIn();
            }, 100);
        };
    };

    // Handler for the OK button in the file name prompt dialog with file existence check and save 
	// The new file will be automatically saved to Azure Storage by the auto-save functionality, which is managed within the setInterval method. 
    const handleFileNamePromptOk = async () => {
        const inputElement = document.getElementById("inputEle") as HTMLInputElement;
        let userFilename = inputElement?.value.trim() || "Untitled";
        const baseFilename = `${userFilename}.docx`;

        // Check if the document already exists on the backend
        const exists = await checkDocumentExistence(baseFilename);
        if (exists) {
            // If the document exists, display an error message in the dialog
            const errorContainer = document.getElementById("errorContainer");
            if (errorContainer) {
                errorContainer.innerHTML = 'Document already exists. Please choose a different name.';
            }
            // Re-focus the input for correction
            if (inputElement) {
                inputElement.focus();
                inputElement.select();
            }
            return;
        }

        // Proceed with new document
        if (dialogObj) dialogObj.hide();
        containerRef.current.documentEditor.documentName = baseFilename;
        setCurrentDocName(baseFilename);
        containerRef.current.documentEditor.openBlank();
    };

    // Handler for the Cancel button in the prompt dialog
    const handleFileNamePromptCancel = () => {
        if (dialogObj) {
            dialogObj.hide();
        }
    };

    return (
        <div>
            <div>
                <AmazonS3FileManager onFileSelect={loadFileFromFileManager} />
            </div>
            <div id="document-editor-div" style={{ display: "block" }}>
                <div id="document-header">
                    {currentDocName || 'None'}
                </div>
                <DocumentEditorContainerComponent
                    ref={containerRef}
                    id="container"
                    height={'650px'}
                    serviceUrl={hostUrl + "api/AmazonS3DocumentStorage/"}
                    enableToolbar={true}
                    toolbarItems={toolbarItems}
                    toolbarClick={handleToolbarClick}
                    contentChange={handleContentChange} // Listen to content changes
                    serverActionSettings={settings}
                />
            </div>
        </div>
    );
}

export default DocumentEditor;