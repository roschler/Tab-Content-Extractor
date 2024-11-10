
// Main script for YouTube video popup.

/**
 * Maximum character count allowed for the input text.
 * This limit is based on the underlying model's token limit.
 * @constant {number}
 */
const MAX_MODEL_CHARS = 4000;

// Element references
const inputTextArea = document.querySelector('#input');
const summaryTypeSelect = document.querySelector('#type');
const summaryFormatSelect = document.querySelector('#format');
const summaryLengthSelect = document.querySelector('#length');
const characterCountSpan = document.querySelector('#character-count');
const characterCountExceededSpan = document.querySelector('#character-count-exceed');
const summarizationUnsupportedDialog = document.querySelector('#summarization-unsupported');
const summarizationUnavailableDialog = document.querySelector('#summarization-unavailable');
const output = document.querySelector('#output');

/**
 * Counts the number of space delimited words in a string.
 */
function countWords(str) {

    if (typeof str !== 'string')
        throw new Error(`Invalid str parameter.  Not a string.`);

    return str.split(' ').length;
}

/**
 * Splits the input text into chunks of up to a specified number of words,
 * attempting not to split sentences when possible.
 *
 * If a sentence exceeds the maximum word limit, it will be split at the limit.
 *
 * @param {string} strText - The input text to be chunked.
 * @param {number} [numWordsPerChunk] - The maximum number of words per chunk.
 *
 * NOTE: The default is set to 700 words because currently the Chrome
 *  local LLM has a per-prompt limit of 1024 tokens.
 *
 * @returns {string[]} An array of text chunks.
 * @throws {Error} Throws an error if strText is not a non-empty string or if numWordsPerChunk is not a positive integer.
 */
function simpleChunkifyText(strText, numWordsPerChunk = 700) {
    // Validate input
    if (typeof strText !== 'string' || strText.trim() === '') {
        throw new Error("strText must be a non-empty string.");
    }
    if (!Number.isInteger(numWordsPerChunk) || numWordsPerChunk <= 0) {
        throw new Error("numWordsPerChunk must be an integer greater than zero.");
    }

    // Split text into sentences (includes punctuation)
    const sentenceRegex = /[^.!?]+[.!?]*/g;
    const sentences = strText.match(sentenceRegex);

    if (!sentences) return []; // Return an empty array if no sentences are found

    const chunks = [];
    let currentChunk = '';
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const sentenceWords = sentence.split(/\s+/);
        const sentenceWordCount = sentenceWords.length;

        // If the sentence itself is longer than numWordsPerChunk, split it
        if (sentenceWordCount > numWordsPerChunk) {
            let wordsProcessed = 0;
            while (wordsProcessed < sentenceWordCount) {
                const wordsToAdd = sentenceWords.slice(wordsProcessed, wordsProcessed + numWordsPerChunk - currentWordCount);
                currentChunk += (currentChunk ? ' ' : '') + wordsToAdd.join(' ');
                currentWordCount += wordsToAdd.length;
                wordsProcessed += wordsToAdd.length;

                // If the current chunk reaches the limit, push it to chunks and reset
                if (currentWordCount >= numWordsPerChunk) {
                    console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                    currentWordCount = 0;
                }
            }
            continue;
        }

        // Check if adding this sentence exceeds the word limit
        if (currentWordCount + sentenceWordCount > numWordsPerChunk) {
            // Push the current chunk to chunks and start a new chunk
            if (currentChunk) {
                console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
            currentWordCount = sentenceWordCount;
        } else {
            // Add the sentence to the current chunk
            currentChunk += (currentChunk ? ' ' : '') + sentence;
            currentWordCount += sentenceWordCount;
        }
    }

    // Add any remaining text in the current chunk
    if (currentChunk) {
        console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * Creates a summarization session. Downloads the model if necessary.
 *
 * @param {string} type - Type of summarization (e.g., 'short', 'detailed').
 * @param {string} format - Format for the summary (e.g., 'text', 'bullets').
 * @param {string} length - Desired length of the summary (e.g., 'short', 'long').
 * @param {Function} [downloadProgressCallback] - Optional callback for tracking download progress.
 * @returns {Promise<Object>} Resolves to the summarization session object.
 * @throws {Error} If AI summarization is not supported.
 */
const createSummarizationSession = async (type, format, length, downloadProgressCallback) => {
    const canSummarize = await window.ai.summarizer.capabilities();
    if (canSummarize.available === 'no') {
        throw new Error('AI Summarization is not supported');
    }

    const summarizationSession = await window.ai.summarizer.create({ type, format, length });
    if (canSummarize.available === 'after-download') {
        if (downloadProgressCallback) {
            summarizationSession.addEventListener('downloadprogress', downloadProgressCallback);
        }
        await summarizationSession.ready;
    }

    return summarizationSession;
}

/**
 * Initializes the application.
 * Checks the availability of the Summarization API, and sets up event listeners
 * for summarizing the text added to the input textarea.
 * If the API is unavailable or unsupported, it displays relevant dialogs.
 */
const initializeApplication = async () => {
    const summarizationApiAvailable = window.ai !== undefined && window.ai.summarizer !== undefined;
    if (!summarizationApiAvailable) {
        summarizationUnavailableDialog.showModal();
        return;
    }

    const canSummarize = await window.ai.summarizer.capabilities();
    if (canSummarize.available === 'no') {
        summarizationUnsupportedDialog.showModal();
        return;
    }

    let timeout;

    // This function appends a period (".")
    //  to a string, but only if it does not already end
    //  with an end of sentence character character.
    function appendPeriodIfNoEosChar(str) {
        const strTrimmed = str.trim();
        
        return /[.!?]$/.test(strTrimmed) ? strTrimmed : strTrimmed + '.';
    }

    /**
     * Summarize one chunk of text.
     *
     * @return {Promise<string>} - Returns the summary for the
     *  chunk of text.
     */
    async function doSummarizeOneChunk(chunkText, chunkNum) {
        if (typeof chunkText !== 'string' || chunkText.length < 1)
            throw new Error(`The chunkText parameter is invalid or empty.`);

        if (!Number.isInteger(chunkNum) || chunkNum < 0)
            throw new Error(`The chunkNum parameter must be an integer greater than or equal to 0.`);

        // Create a summarization session.
        const session = await createSummarizationSession(
            summaryTypeSelect.value,
            summaryFormatSelect.value,
            summaryLengthSelect.value,
        );

        let chunkSummary = '';

        if (chunkText.length > 0) {
            console.log(`Summarizing chunk #${chunkNum}:\n${chunkText}\n\n`)
            chunkSummary = await session.summarize(chunkText);
        }

        session.destroy();

        return chunkSummary;
    }

    /**
     * Summarize a text block.  Chunkify the text if necessary.
     *
     * @param {String} textToSummarize - The text to summarize.
     * @param {Function} funcStatusMessage - A function that
     *  will be called with status messages generated with
     *  during this summarization operation.
     *
     * @return {String[]} - Returns an array containing
     *  the summaries generated during the summarization
     *  operation.
     */
    async function doSummarize(
            textToSummarize,
            funcStatusMessage) {
        if (typeof textToSummarize !== 'string' || textToSummarize.length < 0)
            throw new Error(`The textToSummarize input parameter is empty or invalid.`);
        if (typeof funcStatusMessage !== 'function')
        	throw new Error(`The value in the funcStatusMessage parameter is not a function.`);

        const aryChunks =
            simpleChunkifyText(textToSummarize);

        console.info(`aryChunks object:`);
        console.dir(aryChunks, {depth: null, colors: true});

        funcStatusMessage(`Number of chunks to process: ${aryChunks.length}...\n`);

        // This array will accumulate the summaries across chunks.
        const arySummaries = [];

        for (let i = 0; i < aryChunks.length; i++) {
            const chunkText = appendPeriodIfNoEosChar(aryChunks[i]);

            if (chunkText.length > 0) {
                funcStatusMessage(`Summarizing chunk #${i}:\n${chunkText}\n\n`);
                const chunkSummary = await doSummarizeOneChunk(chunkText, i);

                if (chunkSummary.length > 0) {
                    arySummaries.push(appendPeriodIfNoEosChar(chunkSummary));
                }

                funcStatusMessage(`Summarized chunk #${i}.  Number of words: ${chunkText.length}...\n`);
            }
        }

        return arySummaries;
    }

    /**
     * Schedules the summarization process with a debounce delay.
     * Waits for the user to stop typing for 1 second before generating a summary.
     */
    function scheduleSummarization() {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            output.textContent = 'Generating summary...\n';

            // Chunkify text to keep summarizations inside the LLM
            //  token limit.
            const arySummaries =
                doSummarize(
                    inputTextArea.value,
                    (statusMsg) => {
                        output.textContent += statusMsg;
                    });

            output.textContent = arySummaries.join(' ');

            // No point in summarizing a single chunk summary.
            //  Check for a length greater than 1.
            if (arySummaries.length > 1) {
                const arySummaryOfTheSummaries = [];

                // Now summarize the summaries.  Concatenate
                //  the summary text.
                for (let i = 0; i < arySummaries.length; i++) {
                    if (arySummaries[i].length > 0)
                        arySummaryOfTheSummaries.push(arySummaries[i]);
                }

                const summariesText =
                    arySummaryOfTheSummaries.join(' ');

                output.textContent +=
                    '\n\n==== SUMMARY OF THE SUMMARIES ====\n\n';

                // Summarize the summaries.
                const aryDerivativeSummaries =
                    doSummarize(
                        summariesText,
                        (statusMsg) => {
                            output.textContent += statusMsg;
                        });

                const superSummaryText = aryDerivativeSummaries.join(' ');

                output.textContent += superSummaryText;

                console.log(`Summary of the summaries:\n${superSummaryText}\n\n`)
            }
        }, 1000);
    }

    // Event listeners for UI controls
    summaryTypeSelect.addEventListener('change', scheduleSummarization);
    summaryFormatSelect.addEventListener('change', scheduleSummarization);
    summaryLengthSelect.addEventListener('change', scheduleSummarization);

    inputTextArea.addEventListener('input', () => {
        // Update character count display
        characterCountSpan.textContent = inputTextArea.value.length;
        if (inputTextArea.value.length > MAX_MODEL_CHARS) {
            characterCountSpan.classList.add('tokens-exceeded');
            characterCountExceededSpan.classList.remove('hidden');
        } else {
            characterCountSpan.classList.remove('tokens-exceeded');
            characterCountExceededSpan.classList.add('hidden');
        }
        scheduleSummarization();
    });

    // Ask the content script in the active tab
    //  to grab the YouTube transcript.
    // Find the active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0].id) {
            // Send a message directly to the content script in the active tab
            chrome.tabs.sendMessage(tabs[0].id, { action: "grabTranscript", text: "Requesting video transcript." });
        }
    });

    // Create a connection with the active tab.
    document.addEventListener('DOMContentLoaded', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                // Connect to the content script in the active tab
                const port = chrome.tabs.connect(tabs[0].id, { name: "popup-content-connection" });

                // Listen for messages from the content script

                console.log(`Connecting to active tab...`);

                port.onMessage.addListener((message) => {
                    console.log("Received from content script:", message);

                    if (message.type === 'status') {
                        // Show status messages in the summary area.
                        output.textContent = message.text;
                    } else if (message.type === 'transcriptUnavailable') {
                        // The content script could not grab the transcript.
                        output.textContent = message.text;

                        console.log(message.text);
                    } else if (message.type === 'transcriptGrabbed') {
                        // We have received the text of the transcript.
                        //  Put it in the input window to summarize the
                        //  video.
                        console.log(`Transcript received.  Length: ${message.text.length}`);

                        inputTextArea.value = message.text;

                        // Schedule summarization.
                        scheduleSummarization();
                    } else {
                        console.log(`Unknown message type: ${message.type}`);
                    }
                });

                // Optional: Send a message to grab the transcript.
                port.postMessage({ action: "grabTranscript" });
            }
        });
    });

}

// Start the application
console.log(`Initializing the application.`);

initializeApplication();
