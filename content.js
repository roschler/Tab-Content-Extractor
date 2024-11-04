// This is the content script for the YouTube transcript
//  summarizer extension.

import {extractYouTubeVideoIdFromUrl, isEmptySafeString, isNonNullObjectAndNotArray} from "./misc";
import {TranscriptGrabbed, TranscriptLine} from "./transcript-grabbed-object";

export const DEFAULT_CONFIG_POPUP_UNDER_DIV_ID = 'viewport';
const CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT = 'content-script';

let bVerbose_content = true;

// This is the maximum number of contiguous empty lines we will
//  tolerate in a transcript line objects array generated from
//  parsing the transcript window.
const MAX_EMPTY_CONTIGUOUS_TRANSCRIPT_LINES = 5;

// This is the DIV ID of the main element that contains
//  the video thumbnails in a YouTube channel's videos
//  page.
const ELEMENT_ID_FOR_YOUTUBE_VIDEOS_PAGE_CONTAINER = 'contents';

// -------------------- BEGIN: ARIA LABEL CONSTANTS ------------

const ARIA_LABEL_TRANSCRIPT_BUTTON = 'Show transcript';

// -------------------- END  : ARIA LABEL CONSTANTS ------------

/**
 * @function findElementByTagNameAndText
 * @description Finds all elements of a specified tag name that have exact
 * text content matching the provided text and are currently visible on the
 * page. Visibility considers the element and all its ancestors.
 *
 * @param {String} tagName - The tag name to search for.
 * @param {String} theText - The text content to match exactly.
 *
 * @returns {HTMLElement[]|null} An array of matching elements that are visible
 * on the page, or null if no matching elements are found.
 *
 * @throws {Error} If the tagName or theText is not a valid string.
 */
export function findElementByTagNameAndText(tagName, theText) {
  const errPrefix = '(findElementByTagNameAndText) ';

  // Validate input parameters
  if (typeof tagName !== 'string') {
    throw new Error(`${errPrefix}tagName must be a String`);
  }

  if (tagName.length === 0) {
    throw new Error(`${errPrefix}tagName cannot be an empty String`);
  }

  if (typeof theText !== 'string') {
    throw new Error(`${errPrefix}theText must be a String`);
  }

  if (theText.length === 0) {
    throw new Error(`${errPrefix}theText cannot be an empty String`);
  }

  // Select all elements with the specified tag name
  const elements = document.querySelectorAll(tagName);

  // Filter elements by exact text content and visibility
  const matchingElements = Array.from(elements).filter(element =>
      element.textContent.trim() === theText && isElementVisible(element)
  );

  return matchingElements.length > 0 ? matchingElements : null;
}

/**
 * @function findButtonByAriaLabel
 * @description Finds the first visible button element in the DOM tree that has
 * an aria-label attribute with the specified labelText. Throws an error if
 * more than one visible button matches. If no button matches, returns null.
 * Otherwise, returns a reference to the matching DOM element.
 *
 * @param {String} labelText - The text to match against the aria-label
 * attribute of button elements.
 *
 * @returns {HTMLElement|null} A reference to the matching DOM element, or null
 * if no match is found.
 *
 * @throws {Error} If there is more than one matching visible button, or if the
 * labelText is not a valid string.
 */
export function findButtonByAriaLabel(labelText) {
  const errPrefix = '(findButtonByAriaLabel) ';

  // Check that labelText is a valid string
  if (typeof labelText !== 'string') {
    throw new Error(`${errPrefix}labelText must be a String`);
  }

  if (labelText.length === 0) {
    throw new Error(`${errPrefix}labelText cannot be an empty String`);
  }

  // Get all button elements in the DOM
  const buttons = document.querySelectorAll('button');

  // Filter buttons by aria-label attribute and visibility
  const matchingButtons = Array.from(buttons).filter(button =>
      button.getAttribute('aria-label') === labelText && isElementVisible(button)
  );

  // Check for multiple matches
  if (matchingButtons.length > 1) {
    throw new Error(`${errPrefix}More than one visible button matches the aria-label "${labelText}"`);
  }

  // Return the matching button or null if no match is found
  return matchingButtons.length === 1 ? matchingButtons[0] : null;
}

/**
 * @function isElementVisible
 * @description Checks if an element is visible in the DOM.
 *
 * @param {HTMLElement} element - The DOM element to check for visibility.
 *
 * @returns {Boolean} True if the element is visible, false otherwise.
 */
function isElementVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);

  // Check if the element is hidden using CSS properties
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  // Check if any ancestor is hidden
  let parent = element.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
      return false;
    }
    parent = parent.parentElement;
  }

  return true;
}

/**
 * @function isVisible
 * @description Checks if an element is visible in the viewport.
 *
 * @param {HTMLElement} element - The DOM element to check for visibility.
 *
 * @returns {Boolean} True if the element is visible, false otherwise.
 */
function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
      window.getComputedStyle(element).visibility !== 'hidden' &&
      window.getComputedStyle(element).display !== 'none'
  );
}

/**
 * Wait for a certain length of time using a
 *  promise so other code does not block.
 *
 * @param {Number} waitTimeMS - The number of
 *  milliseconds to wait.
 * @param {String} waitMsg - A message to
 *  print to the console.
 *
 * @return {Promise<void>}
 */
async function waitForAWhile(waitTimeMS, waitMsg){
  const errPrefix = `(waitForAWhile) `;

  if (
      typeof waitTimeMS !== 'number'
      || !Number.isInteger(waitTimeMS)
      || waitTimeMS < 0)
    throw new Error(`${errPrefix}The value in the waitTimeMS parameter is invalid.  Must be a non-negative integer numeric value.`);

  if (isEmptySafeString(waitMsg))
    throw new Error(`${errPrefix}The waitMsg parameter is empty or invalid.`);

  if (bVerbose_content) {
    console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `${waitMsg}`);
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * @function getAllTranscriptTextAndTimes
 * @description Parses the DOM tree to build an array of transcript objects
 * with text, timestamp string, and offset in seconds.
 *
 * @returns {Array<Object>} An array of objects, each containing transcriptText,
 * timestampString, and offsetInSeconds fields.
 *
 * @throws {Error} If an element with the required class or tag is not found,
 * or if there are multiple matches for a required element.
 */
export function getAllTranscriptTextAndTimes() {
  const errPrefix = '(getAllTranscriptTextAndTimes) ';

  // Get all elements with the tag "ytd-transcript-segment-renderer"
  const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
  const aryTranscriptElements = Array.from(transcriptElements).map(domElement => {
    // Find the child DIV element with the class "segment-timestamp"
    const timestampDivs = domElement.querySelectorAll('div.segment-timestamp');
    if (timestampDivs.length === 0) {
      throw new Error(`${errPrefix}No element with class "segment-timestamp" found`);
    }
    if (timestampDivs.length > 1) {
      throw new Error(`${errPrefix}Multiple elements with class "segment-timestamp" found`);
    }
    const timestampString = timestampDivs[0].textContent.trim();

    // Calculate the offset in seconds
    const offsetInSeconds = calculateOffsetInSeconds(timestampString);

    // Find the first DIV with tag "yt-formatted-string"
    const transcriptDivs = domElement.querySelectorAll('yt-formatted-string');
    if (transcriptDivs.length === 0) {
      throw new Error(`${errPrefix}No element with tag "yt-formatted-string" found`);
    }
    if (transcriptDivs.length > 1) {
      throw new Error(`${errPrefix}Multiple elements with tag "yt-formatted-string" found`);
    }
    const transcriptText = transcriptDivs[0].textContent.trim();

    return {
      transcriptText,
      timestampString,
      offsetInSeconds
    };
  });

  return aryTranscriptElements;
}

/**
 * @function calculateOffsetInSeconds
 * @description Calculates the offset in seconds from a timestamp string.
 *
 * @param {String} timestampString - The timestamp string to parse.
 *
 * @returns {Number} The offset in seconds.
 *
 * @throws {Error} If the timestamp string cannot be parsed into integers.
 */
function calculateOffsetInSeconds(timestampString) {
  const errPrefix = '(calculateOffsetInSeconds) ';

  const aryTimePieces = timestampString.split(':');
  const aryPiecesAsIntegers = aryTimePieces.map(piece => {
    const intPiece = parseInt(piece, 10);
    if (isNaN(intPiece)) {
      throw new Error(`${errPrefix}Invalid timestamp string "${timestampString}"`);
    }
    return intPiece;
  });

  let totalSeconds = 0;
  for (let i = 0; i < aryPiecesAsIntegers.length; i++) {
    totalSeconds += aryPiecesAsIntegers[i] * Math.pow(60, aryPiecesAsIntegers.length - 1 - i);
  }

  return totalSeconds;
}

/**
 * @function removeChatContainer
 *
 * @description Finds and removes a DOM element with the tag name "chat-container".
 *
 * @returns {Boolean} Returns true if the element is found and removed, otherwise false.
 *
 * @throws {Error} If any errors occur during the execution of the
 * function, they are thrown with an error message prefixed by the
 * function name.
 */
function removeChatContainer() {
  const errPrefix = '(removeChatContainer) ';

  try {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) {
      return false;
    }

    chatContainer.remove();

    return true;
  } catch (error) {
    console.error(`${errPrefix}${error.message}`);
    return false;
  }
}

/**
 * @function showTranscriptDiv
 * @description Locates DOM elements with the tag name
 * "ytd-engagement-panel-section-list-renderer" that have a descendant
 * with an attribute named "aria-label" and the value of that
 * attribute has the lowercased value equal to "show transcript".
 * If any such elements are found, sets the "display" style attribute
 * to "block" for each and returns the number of elements that were
 * found. Otherwise, returns null.
 *
 * @returns {Number|null} The number of elements found and modified,
 * or null if no elements are found.
 *
 * @throws {Error} If any errors occur during the execution of the
 * function, they are thrown with an error message prefixed by the
 * function name.
 */
export function showTranscriptDiv() {
  const errPrefix = '(showTranscriptDiv) ';

  try {
    const elements = document.getElementsByTagName('ytd-engagement-panel-section-list-renderer');
    let count = 0;

    /**
     * @function recursiveSearch
     * @description Recursively searches through the node's children to find
     * a node with the specified aria-label.
     *
     * @param {Node} node The DOM node to search.
     * @returns {Boolean} True if a matching node is found, false otherwise.
     */
    const recursiveSearch = (node) => {
      if (node.getAttribute && node.getAttribute('aria-label') &&
          node.getAttribute('aria-label').toLowerCase() === 'show transcript') {
        return true;
      }
      for (let i = 0; i < node.children.length; i++) {
        if (recursiveSearch(node.children[i])) {
          return true;
        }
      }
      return false;
    };

    for (let i = 0; i < elements.length; i++) {
      if (recursiveSearch(elements[i])) {
        elements[i].style.display = 'block';
        count++;
      }
    }

    return count > 0 ? count : null;
  } catch (error) {
    throw new Error(`${errPrefix}${error.message}`);
  }
}

/**
 * This function gets the transcript from a video
 *  page.
 *
 * @return {Promise<TranscriptGrabbed>} - Returns
 *  a fully assembled transcript object that contains
 *  the contents of the video being shown on the
 *  current page.
 */
async function getTranscript_async() {
  const errPrefix = `(getTranscript_async) `;

  // Find the Show Transcript button.
  let transcriptBtn =
      await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

  if (!transcriptBtn) {
    // -------------------- BEGIN: REMOVE CHAT CONTAINER ------------

    // We check to see if the chat messages container element
    //  is showing and if so, and remove it immediately since it hides
    //  the DIV that has the show transcript button.
    const bWasChatMessagesWindowClosed = removeChatContainer();

    if (bWasChatMessagesWindowClosed) {
      if (bVerbose_content) {
        console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Successfully found and closed the chat messages window.`);
      }

      // Make sure the transcript div is visible.
      showTranscriptDiv();
      await waitForAWhile(1000, 'Making the transcript DIV visible');
    } else {
      console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `The chat messages window was not visible or we were unable to close it.`);
    }

    // -------------------- END  : CLOSE CHAT MESSAGES WINDOW ------------

    // Try to find the Show Transcript button again.
    transcriptBtn =
        await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);
  }

  // We may need to hit the "Show more" button to
  // make it visible first.
  if (!transcriptBtn) {
    const aryExpandoButtons =
        findElementByTagNameAndText('tp-yt-paper-button', '...more');

    if (aryExpandoButtons) {
      const operationMsg = `Clicking ALL expando buttons now.`;

      if (bVerbose_content) {
        console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, operationMsg);
      }

      aryExpandoButtons.forEach(button => button.click());

      await waitForAWhile(1000, operationMsg);

      if (bVerbose_content) {
        console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, 'Attempting to find transcript button again...');
      }

      // Try to find the show transcript button again.
      transcriptBtn =
          await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

      if (!transcriptBtn) {
        // -------------------- BEGIN: SHOW HIDDEN ENGAGEMENT PANEl ------------

        // There appears to be an odd bug in the YouTube host page
        //  code that hides the engagement panel (or fails to
        //  show it) that has the transcript button.  As a last
        //  resort, try and show it and try to find the button
        //  again.  Note, the engagement panel has a "visibility"
        //  attribute of "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN".
        showTranscriptDiv();

        // Try to find the show transcript button again.
        transcriptBtn =
            await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

        // -------------------- END  : SHOW HIDDEN ENGAGEMENT PANEl ------------
      }
    } else {
      throw new Error(`${errPrefix}Unable to find any expando buttons that might be hiding the show transcript button.`);
    }
  }

  if (!transcriptBtn) {
    // alert(`Unable to find a button with aria label: ${ARIA_LABEL_TRANSCRIPT_BUTTON}`);
    return null;
  }

  // Click the button.
  if (bVerbose_content) {
    console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Clicking the transcript button now.`);
  }
  transcriptBtn.click();

  // TODO: Actually we should do repeated checks
  //  to get the count of transcript elements in the
  //  video transcript window and exit the check
  //  loop when more then X seconds have gone by
  //  and the non-zero count has not changed, indicating
  //  the transcript window has (most likely) finished
  //  loading its content.
  await waitForAWhile(1000, 'Waiting for transcript');

  /*
      transcriptText,
      timestampString,
      offsetInSeconds
   */
  const aryTranscriptObjs = getAllTranscriptTextAndTimes();

  // alert(`Transcript of length(${aryTranscriptObjs}) has been copied to the clipboard.`);

  // Build a transcript grabbed object and return it.
  const newTranscriptGrabbedObj =
      new TranscriptGrabbed();

  // >>>>> Actual video ID.
  const videoId = extractYouTubeVideoIdFromUrl(location.href);
  if (isEmptySafeString(videoId))
    throw new Error(`${errPrefix}The videoId variable is empty or invalid.`);
  newTranscriptGrabbedObj.idOfVideo = videoId;

  // >>>>> Array of transcript lines
  //
  // Convert the array of prototype-less transcript
  //  line objects to TranscriptLine objects.
  let countContiguousEmptyLines = 0;

  for (let ndx = 0; ndx < aryTranscriptObjs.length; ndx++) {
    const rawTranscriptLineObj = aryTranscriptObjs[ndx];

    if (!isNonNullObjectAndNotArray(rawTranscriptLineObj))
      throw new Error(`${errPrefix}The rawTranscriptLineObj variable for element(${ndx}) is not a valid object is not a valid object.`);

    // Sometimes there actually are a few empty lines.
    const useTranscriptText =
        rawTranscriptLineObj.transcriptText.trim();

    if (useTranscriptText.length < 1) {
      countContiguousEmptyLines++;

      // Too many contiguous empty lines?
      if (countContiguousEmptyLines > MAX_EMPTY_CONTIGUOUS_TRANSCRIPT_LINES)
        throw new Error(`${errPrefix}Too many contiguous empty transcript lines.`);
    } else {
      // Reset the contiguous empty line counter since we
      //  found a non-empty line.
      countContiguousEmptyLines = 0;

      const transcriptLineObj =
          new TranscriptLine(useTranscriptText, rawTranscriptLineObj.timestampString, rawTranscriptLineObj.offsetInSeconds);

      newTranscriptGrabbedObj.addTranscriptLineObject(transcriptLineObj);
    }
  }

  if (bVerbose_content) {
    console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Returning new transcript object for video ID: ${videoId}`);
  }

  return newTranscriptGrabbedObj;
}


/**
 * Listener for messages to this content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractText") {
    sendResponse({ text: document.body.innerText });
  }
});
