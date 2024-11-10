/**
 * This listener fires when the current page's DOM
 *  content is loaded.
 */
/**
 * This listener fires when the current page's DOM content is loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Query the active tab to get its URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    // Check if the active tab's URL contains "youtube.com"
    if (activeTab && activeTab.url.includes('youtube.com')) {
      console.log('This is a YouTube page; specific code will not run.');
      // Optional: Insert code here to handle YouTube-specific logic if needed
      return;  // Exit if the active tab is a YouTube page
    }

    // -------------------- BEGIN: HANDLERS FOR NON-YOUTUBE PAGES ------------

    const tabsList = document.getElementById('tabs-list');

    chrome.runtime.sendMessage({ action: "getTabs" }, (tabs) => {
      tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.classList.add('tab-item');
        tabItem.innerHTML = `<input type="checkbox" id="tab-${tab.id}" data-tab-id="${tab.id}"> <label for="tab-${tab.id}">${tab.title}</label>`;
        tabsList.appendChild(tabItem);
      });
    });

    document.getElementById('select-all').addEventListener('click', () => {
      document.querySelectorAll('.tab-item input').forEach(input => input.checked = true);
    });

    document.getElementById('deselect-all').addEventListener('click', () => {
      document.querySelectorAll('.tab-item input').forEach(input => input.checked = false);
    });

    document.getElementById('copy').addEventListener('click', () => handleAction('copy'));
    document.getElementById('save-txt').addEventListener('click', () => handleAction('save-txt'));
    document.getElementById('save-pdf').addEventListener('click', () => handleAction('save-pdf'));
    document.getElementById('save-json').addEventListener('click', () => handleAction('save-json'));
    document.getElementById('save-html').addEventListener('click', () => handleAction('save-html'));
    document.getElementById('summarize').addEventListener('click', () => handleAction('summarize'));

    const optionsDiv = document.querySelector('.options');
    optionsDiv.innerHTML += `
      <label for="only-links">
        <input type="checkbox" id="only-links"> Links only
        <span class="info-icon" title="Download only links to selected pages, without their content.">ⓘ</span>
      </label>
    `;

    // ... other existing code ...

    // -------------------- END  : HANDLERS FOR NON-YOUTUBE PAGES ------------
  });
});

// Include jsPDF library
const script = document.createElement('script');
script.src = chrome.runtime.getURL('jspdf.min.js');
document.head.appendChild(script);

function handleAction(action) {
  const selectedTabs = Array.from(document.querySelectorAll('.tab-item input:checked'))
      .map(input => parseInt(input.getAttribute('data-tab-id')));
  const separateFiles = document.getElementById('separate-files').checked;
  const onlyLinks = document.getElementById('only-links').checked;

  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const selectedTabsInfo = tabs.filter(tab => selectedTabs.includes(tab.id));
    const contents = [];

    if (onlyLinks) {
      selectedTabsInfo.forEach(tab => {
        contents.push({title: tab.title, url: tab.url, content: ''});
      });
      processContents(contents, action, separateFiles, onlyLinks);
    } else {
      let processedTabs = 0;
      selectedTabsInfo.forEach((tab) => {
        chrome.tabs.update(tab.id, { active: false }, (updatedTab) => {
          chrome.scripting.executeScript({
            target: { tabId: updatedTab.id },
            func: extractVisibleText
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError.message);
            } else {
              const content = results[0].result;
              contents.push({title: updatedTab.title, url: updatedTab.url, content: content});
            }

            processedTabs++;
            if (processedTabs === selectedTabsInfo.length) {
              processContents(contents, action, separateFiles, onlyLinks);
            }
          });
        });
      });
    }
  });
}

function processContents(contents, action, separateFiles, onlyLinks) {
  if (action === 'copy') {
    const allContents = contents.map(item => onlyLinks ? `${item.title}\n${item.url}\n\n` : `Title: ${item.title}\nURL: ${item.url}\nContent:\n${item.content}\n\n`).join('');
    navigator.clipboard.writeText(allContents).then(() => {
      alert('Content copied to clipboard');
    });
  } else if (action === 'summarize') {
    alert('Summarize here.');
  } else {
    saveToFile(contents, action.split('-')[1], separateFiles, onlyLinks);
  }
}

function extractVisibleText() {
  return document.body.innerText;
}

function saveToFile(contents, format, separateFiles, onlyLinks) {
  if (format === 'txt') {
    if (separateFiles) {
      contents.forEach((content, index) => {
        const blob = new Blob([onlyLinks ? `${content.title}\n${content.url}` : `Title: ${content.title}\nURL: ${content.url}\nContent:\n${content.content}`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-${index + 1}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } else {
      const allContents = contents.map(item => onlyLinks ? `${item.title}\n${item.url}\n\n` : `Title: ${item.title}\nURL: ${item.url}\nContent:\n${item.content}\n\n`).join('\n');
      const blob = new Blob([allContents], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'content.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  } else if (format === 'pdf') {
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(16);
    contents.forEach((content, index) => {
      if (index > 0) doc.addPage();
      doc.text(content.title, 20, 30);
      doc.setFontSize(14);
      doc.text("URL:", 20, 50);
      doc.setFontSize(10);
      doc.text(content.url, 20, 60);
      if (!onlyLinks) {
        doc.setFontSize(10);
        doc.text("Website content:", 20, 80);
        doc.setFontSize(10);
        const splitText = doc.splitTextToSize(content.content, 170);
        doc.text(splitText, 20, 90);
      }
      doc.setFont('arial');
      doc.text(`-------- END OF CONTENT OF "${content.title}" --------`, 20, 270, { align: 'center' });
    });
    doc.save('content.pdf');
  } else if (format === 'json') {
    const jsonContent = {
      websites: contents.map(item => ({
        title: item.title,
        url: item.url,
        ...(onlyLinks ? {} : { content: { text: item.content } })
      }))
    };
    if (separateFiles) {
      jsonContent.websites.forEach((content, index) => {
        const blob = new Blob([JSON.stringify({ websites: [content] }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-${index + 1}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } else {
      const blob = new Blob([JSON.stringify(jsonContent, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'content.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  } else if (format === 'html') {
    if (separateFiles) {
      contents.forEach((content, index) => {
        const htmlContent = onlyLinks
            ? `<h1>${content.title}</h1><p><a href="${content.url}">${content.url}</a></p>`
            : `<h1>${content.title}</h1><p><a href="${content.url}">${content.url}</a></p><p>${content.content}</p>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-${index + 1}.html`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } else {
      const allContents = contents.map(item =>
          onlyLinks
              ? `<h1>${item.title}</h1><p><a href="${item.url}">${item.url}</a></p>`
              : `<h1>${item.title}</h1><p><a href="${item.url}">${item.url}</a></p><p>${item.content}</p>`
      ).join('<hr>');
      const blob = new Blob([allContents], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'content.html';
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
