// This is the content script for the YouTube transcript
//  summarizer extension.

const DEFAULT_CONFIG_POPUP_UNDER_DIV_ID = 'viewport';
const CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT = 'content-script';

let bVerbose_content = true;

/**
 * Listener for messages to this content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractText") {
    sendResponse({ text: document.body.innerText });
  }
});
