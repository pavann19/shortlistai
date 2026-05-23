/**
 * ATS Copilot Content Scraper Script
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCRAPE_JOB") {
        try {
            const data = scrapeJobPage();
            sendResponse({ success: true, data });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
    }
    return true; // Keep channel open
});

function scrapeJobPage() {
    const url = window.location.href;
    let title = "";
    let company = "";
    let location = "";
    let desc = "";

    if (url.includes("linkedin.com")) {
        // LinkedIn Parsing
        const titleEl = document.querySelector(".job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h2, h1");
        const companyEl = document.querySelector(".job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name");
        const locEl = document.querySelector(".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__bullet");
        const descEl = document.getElementById("job-details") || document.querySelector(".jobs-description__content");

        title = titleEl ? titleEl.innerText.trim() : "";
        company = companyEl ? companyEl.innerText.trim() : "";
        
        // Cleanup company string (LinkedIn often appends sizing/followers info)
        if (company) {
            company = company.split('\n')[0].trim();
        }

        location = locEl ? locEl.innerText.trim() : "";
        if (location) {
            // Shorten description metadata
            location = location.split('·')[0].split('\n')[0].trim();
        }

        desc = descEl ? descEl.innerText.trim() : "";

    } else if (url.includes("indeed.com")) {
        // Indeed Parsing
        const titleEl = document.querySelector("h1.jobsearch-JobInfoHeader-title, .jobsearch-JobInfoHeader-title");
        const companyEl = document.querySelector("[data-company-name='true'], .jobsearch-InlineCompanyRating a");
        const locEl = document.querySelector("#jobLocationSection, .jobsearch-JobInfoHeader-subtitle div:last-child");
        const descEl = document.getElementById("jobDescriptionText");

        title = titleEl ? titleEl.innerText.trim() : "";
        company = companyEl ? companyEl.innerText.trim() : "";
        location = locEl ? locEl.innerText.trim() : "";
        desc = descEl ? descEl.innerText.trim() : "";
    } else {
        // Generic Fallback
        const h1 = document.querySelector("h1");
        title = h1 ? h1.innerText.trim() : document.title;
        desc = document.body.innerText.slice(0, 1000); // Sample
    }

    // Limit description length if too huge (safety check)
    if (desc.length > 8000) {
        desc = desc.slice(0, 8000) + "... [Truncated by Scraper]";
    }

    return { title, company, location, desc };
}
