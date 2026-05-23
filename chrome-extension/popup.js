/**
 * Chrome Extension Popup Handler
 */

document.getElementById("scrape-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("status-text");
    statusEl.innerText = "Querying active tab...";
    statusEl.style.color = "#06b6d4";

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        statusEl.innerText = "Error: Active tab not found.";
        statusEl.style.color = "#ef4444";
        return;
    }

    const url = tab.url || "";
    const allowed = ["linkedin.com", "indeed.com", "glassdoor.com"];
    const isSupported = allowed.some(domain => url.includes(domain));

    if (!isSupported) {
        statusEl.innerText = "Please go to LinkedIn or Indeed first.";
        statusEl.style.color = "#ef4444";
        return;
    }

    statusEl.innerText = "Scraping page elements...";
    
    // Send message to Content Script
    chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_JOB" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            statusEl.innerText = "Refreshed? Reload page and try.";
            statusEl.style.color = "#ef4444";
            return;
        }

        if (response && response.success) {
            const data = response.data;
            statusEl.innerText = "Success! Redirecting to Copilot...";
            statusEl.style.color = "#10b981";

            // Prefill URL. Truncate desc to 1200 chars to avoid exceeding HTTP URL limits
            const titleVal = encodeURIComponent(data.title);
            const compVal = encodeURIComponent(data.company);
            const locVal = encodeURIComponent(data.location);
            const truncatedDesc = data.desc.length > 1500 ? data.desc.slice(0, 1500) + "\n\n... [Truncated for URL limits]" : data.desc;
            const descVal = encodeURIComponent(truncatedDesc);

            const targetUrl = `http://127.0.0.1:8080/?action=add_job&title=${titleVal}&company=${compVal}&location=${locVal}&desc=${descVal}`;
            
            // Open in new tab
            chrome.tabs.create({ url: targetUrl });
        } else {
            statusEl.innerText = response ? response.error : "Failed to scrape page data.";
            statusEl.style.color = "#ef4444";
        }
    });
});
