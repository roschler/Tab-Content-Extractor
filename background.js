// This is the extension's background script.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getTabs") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      sendResponse(tabs);
    });
    return true; // Keep the message channel open for sendResponse
  }
});

// Set the popup based on the active tabs URL.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  setPopupBasedOnURL(tab.url);
});

// Set the popup based on the active tabs URL.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    setPopupBasedOnURL(tab.url);
  }
});

/**
 * This function uses a different popup for YouTube and
 *  everything else.
 *
 * @param {String} url - The tab's URL.
 */
function setPopupBasedOnURL(url) {
  let popupUrl = 'popup.html';  // default popup

  if (url.includes('youtube.com')) {
    popupUrl = 'youtube-popup.html';
  } else {
    popupUrl = 'popup.html';
  }

  chrome.action.setPopup({ popup: popupUrl });
}
