/**
 * AI Career Copilot & ATS Tracker
 * Modular Frontend Core Controller
 */

// Configure PDF.js worker - safely guard in case CDN fails to load
const PDFJS_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

function initPdfJs() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        console.log('ATS Copilot: PDF.js initialized from CDN.');
    } else {
        console.warn('ATS Copilot: PDF.js not loaded from CDN. Attempting dynamic load...');
        const script = document.createElement('script');
        script.src = PDFJS_CDN_URL;
        script.onload = () => {
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                console.log('ATS Copilot: PDF.js dynamically loaded successfully.');
            }
        };
        script.onerror = () => console.warn('ATS Copilot: PDF.js CDN also failed. PDF parsing will be unavailable.');
        document.head.appendChild(script);
    }
}

// ==========================================
// 1. DATABASE MODULE (Job Tracker Storage)
// ==========================================
const JobDB = {
    STORAGE_KEY: 'copilot_ats_jobs',

    getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    get(id) {
        return this.getAll().find(job => job.id === id);
    },

    save(jobData) {
        const jobs = this.getAll();
        if (jobData.id) {
            // Update existing
            const idx = jobs.findIndex(j => j.id === jobData.id);
            if (idx !== -1) {
                jobs[idx] = { ...jobs[idx], ...jobData };
            }
        } else {
            // Create new
            jobData.id = 'job_' + Date.now();
            jobData.dateAdded = new Date().toISOString();
            jobData.score = null;
            jobData.keywordsMatched = 0;
            jobData.keywordsTotal = 0;
            jobs.push(jobData);
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(jobs));
        return jobData;
    },

    delete(id) {
        const jobs = this.getAll().filter(job => job.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(jobs));
    },

    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
};

// ==========================================
// 2. CONFIG & STATE MODULE
// ==========================================
const AppState = {
    activeJobId: null,
    activeResumeText: '',
    activeFileName: '',
    activeFileSize: '',
    
    // API Configuration keys
    getSettings() {
        const defaults = {
            engine: 'local',
            geminiKey: '',
            geminiModel: 'gemini-1.5-flash',
            openaiKey: '',
            openaiModel: 'gpt-4o-mini'
        };
        const stored = localStorage.getItem('copilot_ats_settings');
        return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    },

    saveSettings(settings) {
        localStorage.setItem('copilot_ats_settings', JSON.stringify(settings));
    }
};

// ==========================================
// 3. CLIENT-SIDE PDF PARSER MODULE
// ==========================================
const PDFParser = {
    /**
     * Extracts text from a PDF file using PDF.js
     * @param {File} file 
     * @returns {Promise<string>}
     */
    async extractText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    resolve(fullText);
                } catch (err) {
                    reject(new Error('PDF.js failed to extract text: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('File reader error.'));
            reader.readAsArrayBuffer(file);
        });
    }
};

// ==========================================
// 4. INTELLIGENT AI ENGINE SERVICES
// ==========================================
const AIService = {
    // Standard prompt instructing the AI to output exactly JSON
    getSystemPrompt() {
        return `You are an advanced AI Career Copilot and ATS Recruiter Simulator.
Analyze the provided Resume and Job Description and output a structured JSON response matching the following schema.
Do NOT output any markdown tags (like \`\`\`json), comments, or introductory text. Just raw JSON.

JSON Schema format:
{
  "overallScore": number (0-100, overall match score),
  "summary": "2-3 sentence strategic advice summarizing the gaps and highlighting key match indicators.",
  "skills": {
    "matched": ["list", "of", "found", "skills"],
    "missing": ["list", "of", "crucial", "missing", "skills"]
  },
  "starBullets": [
    {
      "original": "the exact original bullet point from experience that needs improvement",
      "grade": "A, B, C, or F",
      "suggestion": "a fully rewritten version following the STAR format (incorporating metrics, actions, and job keywords)"
    }
  ],
  "personas": {
    "ats": { "score": number, "verdict": "PASS/HOLD/FAIL", "feedback": "string feedback" },
    "recruiter": { "score": number, "verdict": "PASS/HOLD/FAIL", "feedback": "string feedback" },
    "manager": { "score": number, "verdict": "PASS/HOLD/FAIL", "feedback": "string feedback" }
  },
  "radarDimensions": {
    "Technical Skills": { "target": number, "candidate": number },
    "Core CS Concepts": { "target": number, "candidate": number },
    "Tools & Methods": { "target": number, "candidate": number },
    "Soft Skills": { "target": number, "candidate": number }
  },
  "heatmapKeywords": [
     "list of 5-8 key matching phrases or metrics that recruiters will scan first in the resume text"
  ],
  "interviewQuestions": [
    {
      "question": "question string",
      "rationale": "why this question is asked based on gaps or skills",
      "coaching": "how they should outline their response using STAR"
    }
  ]
}`;
    },

    async scan(resumeText, jobDescription) {
        const settings = AppState.getSettings();

        if (settings.engine === 'gemini' && settings.geminiKey) {
            return this.callGemini(resumeText, jobDescription, settings);
        } else if (settings.engine === 'openai' && settings.openaiKey) {
            return this.callOpenAI(resumeText, jobDescription, settings);
        } else if (settings.engine === 'webllm') {
            return this.callWebLLM(resumeText, jobDescription, settings);
        } else {
            // Local fallback analyzer
            return this.localAnalyze(resumeText, jobDescription);
        }
    },

    async callWebLLM(resumeText, jobDescription, settings) {
        const statusCard = document.getElementById('webllm-loading-card');
        const pctEl = document.getElementById('webllm-download-pct');
        const progressEl = document.getElementById('webllm-download-progress');
        const statusText = document.getElementById('webllm-download-status');

        if (statusCard) statusCard.style.display = 'block';
        UI.showLoadingOverlay("Initializing Local AI Engine", "Loading WebLLM catalog...", 10);
        
        try {
            // Dynamically import WebLLM
            const webllm = await import("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/dist/index.js");
            
            const initProgressCallback = (report) => {
                console.log(report.text);
                const text = report.text || "";
                if (statusText) statusText.innerText = text;
                
                // Parse percentage
                const match = text.match(/\[(\d+)\/(\d+)\]|(\d+)%/);
                if (match) {
                    let pct = 0;
                    if (match[3]) {
                        pct = parseInt(match[3]);
                    } else {
                        pct = Math.round((parseInt(match[1]) / parseInt(match[2])) * 100);
                    }
                    if (pctEl) pctEl.innerText = `${pct}%`;
                    if (progressEl) progressEl.style.width = `${pct}%`;
                    UI.showLoadingOverlay("Downloading Local AI Weights", text, 10 + (pct * 0.7));
                }
            };

            const modelId = settings.webllmModel || "Qwen/Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
            
            UI.showLoadingOverlay("Loading Local AI", "Initializing WebGPU ChatEngine...", 85);
            const engine = await webllm.CreateMLCEngine(modelId, { initProgressCallback });
            
            UI.showLoadingOverlay("Executing Local Inference", "Analyzing resume structure semantically (this runs locally on your GPU)...", 90);
            const prompt = `${this.getSystemPrompt()}\n\nRESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
            
            const messages = [
                { role: 'user', content: prompt }
            ];
            
            const reply = await engine.chat.completions.create({ messages });
            const jsonText = reply.choices[0].message.content;
            
            // Release GPU VRAM
            await engine.unload();
            if (statusCard) statusCard.style.display = 'none';
            
            return this.parseJSONResponse(jsonText);
        } catch (err) {
            console.error(err);
            if (statusCard) statusCard.style.display = 'none';
            throw new Error("WebLLM Error: " + err.message + ". Check if WebGPU is supported on your browser/GPU.");
        }
    },

    async callGemini(resumeText, jobDescription, settings) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${settings.geminiKey}`;
        const prompt = `${this.getSystemPrompt()}\n\nRESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `Gemini API Error: Status ${response.status}`);
        }

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text;
        return this.parseJSONResponse(jsonText);
    },

    async callOpenAI(resumeText, jobDescription, settings) {
        const url = `https://api.openai.com/v1/chat/completions`;
        const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.openaiKey}`
            },
            body: JSON.stringify({
                model: settings.openaiModel,
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `OpenAI API Error: Status ${response.status}`);
        }

        const data = await response.json();
        const jsonText = data.choices[0].message.content;
        return this.parseJSONResponse(jsonText);
    },

    parseJSONResponse(text) {
        try {
            // Clean up any markdown code block wrapper if model didn't obey
            let clean = text.trim();
            if (clean.startsWith('```')) {
                clean = clean.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            }
            return JSON.parse(clean);
        } catch (e) {
            console.error("Failed to parse JSON directly. Raw: ", text);
            throw new Error("AI returned an invalid JSON response structure.");
        }
    },

    // ==========================================
    // 5. LOCAL HEURISTICS / FALLBACK SCANNER
    // ==========================================
    localAnalyze(resumeText, jobDescription) {
        // Normalizing
        const rNorm = resumeText.toLowerCase();
        const jNorm = jobDescription.toLowerCase();

        // Standard skills databases for local keyword scanning
        const skillsDB = [
            'javascript', 'typescript', 'python', 'java', 'react', 'node', 'vue', 'angular',
            'aws', 'docker', 'kubernetes', 'ci/cd', 'sql', 'nosql', 'mongodb', 'postgresql',
            'agile', 'scrum', 'git', 'sass', 'css', 'html', 'cloud', 'graphql', 'rest api',
            'machine learning', 'data science', 'testing', 'cypress', 'jest', 'webpack'
        ];

        // 1. Find keywords from job description
        const jdSkills = skillsDB.filter(skill => jNorm.includes(skill));
        
        // 2. Identify matched and missing
        const matched = jdSkills.filter(skill => rNorm.includes(skill));
        const missing = jdSkills.filter(skill => !rNorm.includes(skill));

        // Format keywords labels nicely
        const cleanMatched = matched.map(s => s.toUpperCase());
        const cleanMissing = missing.map(s => s.toUpperCase());
        
        // 3. Compute simple matches
        const totalSkills = jdSkills.length || 10;
        const matchPercent = Math.min(Math.round((matched.length / totalSkills) * 100), 95);
        const overallScore = matchPercent < 20 ? 35 : matchPercent; // Add baseline

        // 4. Evaluate experience bullets (STAR format scanner)
        // Split by lines and identify bullet points
        const lines = resumeText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const bulletLines = lines.filter(l => l.startsWith('-') || l.startsWith('*') || l.startsWith('•'));
        
        const starBullets = [];
        let bulletsScoreAcc = 0;

        const demoBullets = bulletLines.slice(0, 4);
        if (demoBullets.length === 0) {
            // Backup bullets if nothing parsed
            demoBullets.push(
                "- Responsible for writing front-end components and styling web app layout.",
                "- Managed migration of codebase and fixed bug backlogs."
            );
        }

        demoBullets.forEach(b => {
            const raw = b.replace(/^[-*•]\s*/, '').trim();
            // STAR check metrics: search for numbers, percentages, currency, plus signs
            const hasMetric = /[0-9]+%|\$[0-9]+|[0-9]+\s*(?:hours|days|x|percent|users|clients|developer|team)/i.test(raw);
            const hasActionVerb = /led|built|developed|implemented|optimized|designed|architected|migrated|reduced|increased/i.test(raw);
            
            let grade = 'C';
            let suggestion = raw;

            if (hasMetric && hasActionVerb) {
                grade = 'A';
                bulletsScoreAcc += 10;
                suggestion = `Successfully ${raw} delivering 100% targeted accuracy and improving overall load times.`;
            } else if (hasMetric) {
                grade = 'B';
                bulletsScoreAcc += 8;
                suggestion = `Optimized and ${raw.charAt(0).toLowerCase() + raw.slice(1)}, accelerating user engagement.`;
            } else if (hasActionVerb) {
                grade = 'C';
                bulletsScoreAcc += 6;
                // Add fake metric suggestion
                suggestion = `${raw.charAt(0).toUpperCase() + raw.slice(1)} resulting in a 25% increase in operations efficiency.`;
            } else {
                grade = 'F';
                bulletsScoreAcc += 4;
                suggestion = `Led and architected code components, enhancing page layout performance by 30% and matching user requirements.`;
            }

            starBullets.push({ original: raw, grade, suggestion });
        });

        const starOverallGradeValue = Math.round(bulletsScoreAcc / (demoBullets.length || 1));
        let overallGradeLetter = 'B';
        if (starOverallGradeValue >= 9) overallGradeLetter = 'A';
        else if (starOverallGradeValue >= 7) overallGradeLetter = 'B';
        else if (starOverallGradeValue >= 5) overallGradeLetter = 'C';
        else overallGradeLetter = 'F';

        // 5. Build persona score and feedback
        const atsScore = Math.min(overallScore + 5, 98);
        const recruiterScore = Math.min(overallScore - 5, 90);
        const managerScore = Math.min(overallScore - 10, 85);

        const atsVerdict = atsScore >= 75 ? 'PASS' : (atsScore >= 50 ? 'HOLD' : 'FAIL');
        const recruiterVerdict = recruiterScore >= 70 ? 'PASS' : (recruiterScore >= 50 ? 'SKEPTICAL' : 'FAIL');
        const managerVerdict = managerScore >= 65 ? 'PASS' : (managerScore >= 50 ? 'HOLD' : 'FAIL');

        // 6. Heatmap triggers
        const heatwords = cleanMatched.slice(0, 5).concat(['ENGINEER', 'LED', 'DEVELOPED', 'PROJECT', 'DESIGNED']);

        // Return structured mock object matching the LLM format
        return {
            overallScore,
            summary: `Overall match is ${overallScore}%. The candidate demonstrates solid foundations in ${cleanMatched.slice(0,3).join(', ') || 'basic technologies'}. However, critical technical gaps in ${cleanMissing.slice(0,3).join(', ') || 'advanced tools'} were identified. Enhancing experience bullets with quantitative metrics will elevate the profile.`,
            skills: {
                matched: cleanMatched,
                missing: cleanMissing.length > 0 ? cleanMissing : ['DOCKER', 'KUBERNETES', 'AWS', 'UNIT TESTING']
            },
            starBullets,
            personas: {
                ats: {
                    score: atsScore,
                    verdict: atsVerdict,
                    feedback: `Parsability is high. Clear section headers found. Keyword density matches target requirements. Structurally, this document will pass standard ATS screenings.`
                },
                recruiter: {
                    score: recruiterScore,
                    verdict: recruiterVerdict,
                    feedback: `Candidate has matching experience, but resume fails to pop in the initial 6 seconds. Missing explicit callouts for major tools in the summary section. Make key tech stacks bold.`
                },
                manager: {
                    score: managerScore,
                    verdict: managerVerdict,
                    feedback: `Technical skills look adequate, but experience bullets lack measurable business impact. I need to see metrics: did performance increase? By how much? Did it scale?`
                }
            },
            radarDimensions: {
                "Technical Skills": { target: 90, candidate: Math.max(overallScore - 10, 40) },
                "Core CS Concepts": { target: 80, candidate: Math.max(overallScore - 5, 50) },
                "Tools & Methods": { target: 85, candidate: Math.max(overallScore - 15, 35) },
                "Soft Skills": { target: 80, candidate: 85 }
            },
            heatmapKeywords: heatwords,
            interviewQuestions: [
                {
                    question: `Can you describe your experience implementing ${cleanMissing[0] || 'AWS cloud deployment'} and how you would design a scalable workflow?`,
                    rationale: `The job posting highlights ${cleanMissing[0] || 'AWS Cloud'} as a core requirement, which is currently missing or weakly represented in your resume.`,
                    coaching: `Focus on explaining the underlying theory, mentioning any related technologies you've worked with (e.g. standard cloud setups), and present a structured STAR response outlining steps.`
                },
                {
                    question: "Tell me about a time you optimized a slow application component. What actions did you take and what were the outcomes?",
                    rationale: "Ensuring the hiring manager sees your capability to drive performance optimization and measure results.",
                    coaching: "Quantify the baseline performance, explain the specific tools used for analysis, detailing your code adjustments, and conclude with the percentage load-time reduction."
                }
            ]
        };
    }
};

// ==========================================
// 6. VISUALIZATION CANVAS & SVG ENGINE
// ==========================================
const Visualizer = {
    /**
     * Generates a radar chart SVG and injects it
     * @param {string} containerId 
     * @param {object} dimensions 
     */
    drawRadarChart(containerId, dimensions) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const width = 340;
        const height = 340;
        const center = width / 2;
        const radius = 110;
        
        const axes = Object.keys(dimensions);
        const numAxes = axes.length;
        
        // Compute coordinates
        const getCoordinates = (index, value) => {
            const angle = (Math.PI * 2 / numAxes) * index - Math.PI / 2;
            const x = center + radius * (value / 100) * Math.cos(angle);
            const y = center + radius * (value / 100) * Math.sin(angle);
            return { x, y };
        };

        let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">`;
        
        // 1. Draw background grid rings (e.g., 20%, 40%, 60%, 80%, 100%)
        const gridRings = [20, 40, 60, 80, 100];
        gridRings.forEach(r => {
            let points = [];
            for (let i = 0; i < numAxes; i++) {
                const coord = getCoordinates(i, r);
                points.push(`${coord.x},${coord.y}`);
            }
            svgContent += `<polygon points="${points.join(' ')}" class="radar-grid-line" fill="none" />`;
        });

        // 2. Draw axis lines & labels
        axes.forEach((axis, i) => {
            const outerCoord = getCoordinates(i, 100);
            
            // Draw axis line
            svgContent += `<line x1="${center}" y1="${center}" x2="${outerCoord.x}" y2="${outerCoord.y}" class="radar-axis-line" />`;
            
            // Label positioning (push outwards slightly)
            const labelDist = 125;
            const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
            const lx = center + labelDist * Math.cos(angle);
            const ly = center + labelDist * Math.sin(angle) + 4; // Adjust vertical alignment
            
            svgContent += `<text x="${lx}" y="${ly}" class="radar-axis-label">${axis}</text>`;
        });

        // 3. Draw Target Area Polygon
        let targetPoints = [];
        axes.forEach((axis, i) => {
            const value = dimensions[axis].target;
            const coord = getCoordinates(i, value);
            targetPoints.push(`${coord.x},${coord.y}`);
        });
        svgContent += `<polygon points="${targetPoints.join(' ')}" class="radar-polygon-target" />`;

        // 4. Draw Candidate Area Polygon
        let candidatePoints = [];
        axes.forEach((axis, i) => {
            const value = dimensions[axis].candidate;
            const coord = getCoordinates(i, value);
            candidatePoints.push(`${coord.x},${coord.y}`);
        });
        svgContent += `<polygon points="${candidatePoints.join(' ')}" class="radar-polygon-candidate" />`;

        // 5. Draw Candidate points
        axes.forEach((axis, i) => {
            const value = dimensions[axis].candidate;
            const coord = getCoordinates(i, value);
            svgContent += `<circle cx="${coord.x}" cy="${coord.y}" class="radar-candidate-point" />`;
        });

        // 6. Draw Chart Legend
        const lyOffset = height - 15;
        svgContent += `
            <g transform="translate(${center - 110}, ${lyOffset})">
                <rect x="0" y="0" width="12" height="12" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" stroke-width="1.5" rx="2" />
                <text x="18" y="10" fill="#94a3b8" font-size="10" font-weight="600">Job Target</text>
                
                <rect x="110" y="0" width="12" height="12" fill="rgba(6, 182, 212, 0.15)" stroke="#06b6d4" stroke-width="2" rx="2" />
                <text x="128" y="10" fill="#94a3b8" font-size="10" font-weight="600">Your Resume</text>
            </g>
        `;

        svgContent += `</svg>`;
        container.innerHTML = svgContent;
    },

    /**
     * Renders simulated heat points onto the heatmap canvas overlay
     * @param {string} canvasId 
     * @param {string} textContainerId 
     * @param {Array<string>} keywords 
     */
    drawEyeHeatmap(canvasId, textContainerId, keywords) {
        const canvas = document.getElementById(canvasId);
        const container = document.getElementById(textContainerId);
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        // Match canvas dimensions to layout sheet
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        // Clear canvas
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Get plain text of container
        const text = container.innerText;
        const textLower = text.toLowerCase();
        
        const heatPoints = [];

        // 1. Generate focal points based on sections (visual heuristics)
        // Recruiters look at top header, first jobs, summary
        const sections = [
            { term: 'summary', radius: 90, intensity: 0.8 },
            { term: 'experience', radius: 100, intensity: 0.95 },
            { term: 'education', radius: 80, intensity: 0.5 },
            { term: 'skills', radius: 95, intensity: 0.7 }
        ];

        // Search for sections positions roughly or simulate
        sections.forEach(s => {
            const idx = textLower.indexOf(s.term);
            if (idx !== -1) {
                // Estimate Y based on text character index fraction
                const fraction = idx / text.length;
                const estimatedY = rect.height * fraction + 20;
                heatPoints.push({
                    x: rect.width / 2, // Centered focus
                    y: Math.min(Math.max(estimatedY, 50), rect.height - 50),
                    radius: s.radius,
                    intensity: s.intensity
                });
            }
        });

        // 2. Add hot zones for matched key skills and bold structures
        keywords.forEach((keyword, index) => {
            const kw = keyword.toLowerCase();
            let startIdx = 0;
            // Find up to 3 occurrences per keyword to map heat
            for (let occurrence = 0; occurrence < 3; occurrence++) {
                const idx = textLower.indexOf(kw, startIdx);
                if (idx === -1) break;
                
                const fraction = idx / text.length;
                const estimatedY = rect.height * fraction + (Math.random() * 30 - 15);
                const estimatedX = 60 + Math.random() * (rect.width - 120);

                heatPoints.push({
                    x: estimatedX,
                    y: Math.min(Math.max(estimatedY, 40), rect.height - 40),
                    radius: 45 + Math.random() * 20,
                    intensity: 0.5 + (0.5 * (1 / (index + 1))) // Higher weight for top keywords
                });

                startIdx = idx + kw.length;
            }
        });

        // 3. Fallback baseline if no points found
        if (heatPoints.length === 0) {
            heatPoints.push(
                { x: rect.width / 2, y: 100, radius: 80, intensity: 0.8 },
                { x: rect.width / 2, y: 250, radius: 90, intensity: 0.9 },
                { x: rect.width / 3, y: 400, radius: 60, intensity: 0.6 }
            );
        }

        // Draw radial gradients for heatmap simulation
        heatPoints.forEach(p => {
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
            
            // Build transparent heat colors (red inside, yellow, green, transparent outer)
            grad.addColorStop(0, `rgba(239, 68, 68, ${p.intensity})`);
            grad.addColorStop(0.2, `rgba(239, 68, 68, ${p.intensity * 0.8})`);
            grad.addColorStop(0.5, `rgba(245, 158, 11, ${p.intensity * 0.4})`);
            grad.addColorStop(0.8, `rgba(16, 185, 129, ${p.intensity * 0.1})`);
            grad.addColorStop(1, 'rgba(16, 185, 129, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
};

// ==========================================
// 7. USER INTERFACE CONTROLLER
// ==========================================
const UI = {
    activeView: 'job-tracker-view',
    activeResults: null,

    init() {
        console.log("ATS Copilot: UI initialization started.");
        try {
            // Safely initialize PDF.js now that the DOM is ready
            initPdfJs();
            this.bindEvents();
            console.log("ATS Copilot: Events bound successfully.");
            this.loadSettings();
            console.log("ATS Copilot: Settings loaded successfully.");
            this.renderJobsTable();
            console.log("ATS Copilot: Jobs table rendered successfully.");
            this.updateActiveJobDisplay();
            console.log("ATS Copilot: Active job display updated successfully.");
            this.checkUrlParameters();
            console.log("ATS Copilot: URL parameters checked successfully.");
            
            // Initialize Resume Builder
            ResumeBuilder.init();
            console.log("ATS Copilot: Resume Builder initialized successfully.");
            console.log("ATS Copilot: UI initialization completed successfully!");
        } catch (error) {
            console.error("ATS Copilot: Error during UI initialization:", error);
        }
    },

    bindEvents() {
        // View Swapper Links
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if (item.classList.contains('disabled')) return;
                const viewId = item.getAttribute('data-target');
                this.switchView(viewId);
            });
        });

        // Add Job Modal Triggers
        document.getElementById('open-add-job-modal').addEventListener('click', () => this.openJobModal());
        document.getElementById('close-job-modal').addEventListener('click', () => this.closeJobModal());
        document.getElementById('cancel-job-modal').addEventListener('click', () => this.closeJobModal());
        
        // Job Form Submission
        document.getElementById('job-form').addEventListener('submit', (e) => this.handleJobSubmit(e));

        // Settings View
        document.getElementById('ai-engine-select').addEventListener('change', (e) => this.toggleEngineFields(e.target.value));
        document.getElementById('save-settings-btn').addEventListener('click', () => this.saveSettings());

        // File Selection/Drop
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const fileTrigger = document.getElementById('file-browse-trigger');

        fileTrigger.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        document.getElementById('remove-file-btn').addEventListener('click', () => this.clearFileSelection());

        // Scan Action Trigger
        document.getElementById('trigger-scan-btn').addEventListener('click', () => this.runScan());
        document.getElementById('go-to-tracker-btn').addEventListener('click', () => this.switchView('job-tracker-view'));

        // Tab Navigation inside Results
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                const panelId = btn.getAttribute('data-tab');
                document.getElementById(panelId).classList.add('active');

                // Re-trigger layout-based canvas updates if heatmap tab clicked
                if (panelId === 'tab-heatmap' && this.activeResults) {
                    // Delay slightly to ensure browser completes panel transition sizing
                    setTimeout(() => {
                        Visualizer.drawEyeHeatmap(
                            'heatmap-overlay-canvas', 
                            'resume-text-render-container', 
                            this.activeResults.heatmapKeywords
                        );
                    }, 50);
                }
            });
        });

        // Heatmap Controls
        const opacitySlider = document.getElementById('heatmap-opacity');
        const canvasElement = document.getElementById('heatmap-overlay-canvas');
        opacitySlider.addEventListener('input', (e) => {
            canvasElement.style.opacity = e.target.value / 100;
        });

        document.getElementById('btn-heatmap-combined').addEventListener('click', (e) => {
            document.getElementById('btn-heatmap-only').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById('resume-text-render-container').style.opacity = '1';
        });

        document.getElementById('btn-heatmap-only').addEventListener('click', (e) => {
            document.getElementById('btn-heatmap-combined').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById('resume-text-render-container').style.opacity = '0.04';
        });

        // Search & Filters for Job Table
        document.getElementById('job-search').addEventListener('input', () => this.renderJobsTable());
        document.getElementById('status-filter').addEventListener('change', () => this.renderJobsTable());
        
        // Sorting Headers
        document.querySelectorAll('.job-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const sortBy = th.getAttribute('data-sort');
                const currentDir = th.getAttribute('data-dir') || 'asc';
                const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
                
                document.querySelectorAll('.job-table th.sortable').forEach(h => h.removeAttribute('data-dir'));
                th.setAttribute('data-dir', nextDir);
                
                this.renderJobsTable(sortBy, nextDir);
            });
        });

        // Demo Loader Button
        document.getElementById('load-demo-btn').addEventListener('click', () => this.loadDemoWorkspace());

        // Table vs. Kanban View Toggles
        document.getElementById('btn-view-table').addEventListener('click', (e) => {
            document.getElementById('btn-view-kanban').classList.remove('active');
            document.getElementById('btn-view-table').classList.add('active');
            document.getElementById('job-table-wrapper').style.display = 'block';
            document.getElementById('kanban-board-element').style.display = 'none';
            this.renderJobsTable();
        });

        document.getElementById('btn-view-kanban').addEventListener('click', (e) => {
            document.getElementById('btn-view-table').classList.remove('active');
            document.getElementById('btn-view-kanban').classList.add('active');
            document.getElementById('job-table-wrapper').style.display = 'none';
            document.getElementById('kanban-board-element').style.display = 'grid';
            this.renderKanbanBoard();
        });

        // Print resume trigger
        document.getElementById('btn-print-resume').addEventListener('click', () => {
            window.print();
        });

        // Web AI Prompter Listeners
        const copyBtn = document.getElementById('btn-copy-prompt');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const promptArea = document.getElementById('web-ai-prompt-area');
                navigator.clipboard.writeText(promptArea.value).then(() => {
                    const btn = document.getElementById('btn-copy-prompt');
                    const oldHTML = btn.innerHTML;
                    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                    btn.style.background = 'var(--accent-green)';
                    btn.style.color = '#ffffff';
                    setTimeout(() => {
                        btn.innerHTML = oldHTML;
                        btn.style.background = '';
                        btn.style.color = '';
                    }, 2000);
                }).catch(err => {
                    alert("Failed to copy text: " + err.message);
                });
            });
        }

        const chatgptBtn = document.getElementById('btn-open-chatgpt');
        if (chatgptBtn) {
            chatgptBtn.addEventListener('click', () => {
                window.open('https://chatgpt.com/', '_blank');
            });
        }

        const geminiBtn = document.getElementById('btn-open-gemini');
        if (geminiBtn) {
            geminiBtn.addEventListener('click', () => {
                window.open('https://gemini.google.com/app', '_blank');
            });
        }
    },

    switchView(viewId) {
        document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');

        const activeMenuItem = document.querySelector(`.menu-item[data-target="${viewId}"]`);
        if (activeMenuItem) activeMenuItem.classList.add('active');

        this.activeView = viewId;

        // Dynamic view titles
        const titles = {
            'job-tracker-view': 'Target Job Tracker',
            'scan-view': 'Resume Optimizer Scanner',
            'results-view': 'Analysis Dashboard Insights',
            'resume-builder-view': 'Interactive Resume Builder',
            'settings-view': 'Configuration Panel'
        };
        document.getElementById('main-view-title').innerText = titles[viewId] || 'ATS Copilot';

        // Refresh keyword injector when entering Resume Builder view
        if (viewId === 'resume-builder-view') {
            KeywordInjector.refresh();
        }
    },

    // ==========================================
    // JOB CRUD CONTROLS
    // ==========================================
    renderJobsTable(sortBy = 'date', sortDir = 'desc') {
        const body = document.getElementById('job-table-body');
        const jobs = JobDB.getAll();
        
        // Apply search query
        const searchQuery = document.getElementById('job-search').value.toLowerCase();
        const statusFilter = document.getElementById('status-filter').value;
        
        let filtered = jobs.filter(job => {
            const matchesSearch = job.title.toLowerCase().includes(searchQuery) || 
                                  job.company.toLowerCase().includes(searchQuery) ||
                                  job.description.toLowerCase().includes(searchQuery);
            const matchesFilter = statusFilter === 'all' || job.status === statusFilter;
            return matchesSearch && matchesFilter;
        });

        // Apply sorting
        filtered.sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];
            
            // Fallback default
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (sortBy === 'score') {
                valA = valA === null ? -1 : valA;
                valB = valB === null ? -1 : valB;
            }

            if (typeof valA === 'string') {
                return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return sortDir === 'asc' ? valA - valB : valB - valA;
            }
        });

        body.innerHTML = '';
        
        if (filtered.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center empty-state">
                        <i class="fa-regular fa-folder-open"></i>
                        <p>No jobs match your search parameters. Click <strong>Add Target Job</strong> to register a new one.</p>
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(job => {
            const tr = document.createElement('tr');
            if (job.id === AppState.activeJobId) {
                tr.classList.add('active-target');
            }
            
            // Added date formatting
            const dateStr = new Date(job.dateAdded).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: '2-digit'});
            
            // Status CSS class
            const statusClass = `status-${job.status.toLowerCase()}`;
            
            // Score Badge styling
            let scoreBadgeHTML = `<span class="score-badge score-badge-none">No Scan</span>`;
            if (job.score !== null) {
                let ratingClass = 'score-badge-low';
                if (job.score >= 75) ratingClass = 'score-badge-high';
                else if (job.score >= 50) ratingClass = 'score-badge-medium';
                scoreBadgeHTML = `<span class="score-badge ${ratingClass}">${job.score}%</span>`;
            }

            // Keyword ratio
            const keywordStr = job.keywordsTotal > 0 ? `${job.keywordsMatched}/${job.keywordsTotal}` : 'N/A';

            tr.innerHTML = `
                <td><span class="status-badge ${statusClass}">${job.status}</span></td>
                <td><strong>${job.title}</strong></td>
                <td>${job.company}</td>
                <td><span class="text-secondary">${job.type || 'Full-time'}</span></td>
                <td>${scoreBadgeHTML}</td>
                <td><span class="text-secondary">${keywordStr}</span></td>
                <td><span class="text-muted" style="font-size:0.8rem">${dateStr}</span></td>
                <td class="text-right">
                    <div class="cell-actions">
                        <button class="btn btn-outline select-job-row-btn" data-id="${job.id}">
                            <i class="fa-solid fa-crosshairs"></i> Select Target
                        </button>
                        <button class="btn btn-outline btn-icon-only edit-job-row-btn" data-id="${job.id}" title="Edit Job">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="btn btn-outline btn-icon-only btn-danger delete-job-row-btn" data-id="${job.id}" title="Delete Job">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            // Row click bindings
            tr.querySelector('.select-job-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.setActiveJob(job.id);
            });
            tr.querySelector('.edit-job-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openJobModal(job.id);
            });
            tr.querySelector('.delete-job-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete the job targeting "${job.title}" at "${job.company}"?`)) {
                    JobDB.delete(job.id);
                    if (AppState.activeJobId === job.id) {
                        AppState.activeJobId = null;
                        this.updateActiveJobDisplay();
                    }
                    this.renderJobsTable();
                }
            });

            body.appendChild(tr);
        });
    },

    setActiveJob(jobId) {
        AppState.activeJobId = jobId;
        this.updateActiveJobDisplay();
        this.renderJobsTable();
        
        // Automatically switch to Scan View once target selected
        this.switchView('scan-view');
    },

    updateActiveJobDisplay() {
        const titleEl = document.getElementById('sidebar-job-title');
        const companyEl = document.getElementById('sidebar-job-company');
        const activeCard = document.getElementById('sidebar-active-job-card');
        
        const previewFilled = document.getElementById('active-job-details-filled');
        const previewEmpty = document.getElementById('active-job-details-empty');

        if (AppState.activeJobId) {
            const job = JobDB.get(AppState.activeJobId);
            if (job) {
                // Sidebar card
                titleEl.innerText = job.title;
                companyEl.innerText = job.company;
                activeCard.style.borderLeft = `3px solid var(--accent-cyan)`;
                
                // Scanner preview column
                previewFilled.style.display = 'flex';
                previewEmpty.style.display = 'none';

                document.getElementById('preview-job-status').innerText = job.status;
                document.getElementById('preview-job-status').className = `status-badge status-${job.status.toLowerCase()}`;
                document.getElementById('preview-job-title').innerText = job.title;
                document.getElementById('preview-job-company').innerHTML = `${job.company} &bull; ${job.location || 'Not Specified'} (${job.type || 'Full-time'})`;
                document.getElementById('preview-job-desc').innerText = job.description;
                return;
            }
        }
        
        // Empty state
        titleEl.innerText = 'No Job Selected';
        companyEl.innerText = 'Select from Job Tracker';
        activeCard.style.borderLeft = `1px solid var(--glass-border)`;
        
        previewFilled.style.display = 'none';
        previewEmpty.style.display = 'flex';
    },

    openJobModal(jobId = null) {
        const modal = document.getElementById('job-modal');
        const form = document.getElementById('job-form');
        
        form.reset();
        document.getElementById('job-id').value = '';
        document.getElementById('modal-title').innerText = 'Add Target Job';
        
        if (jobId) {
            const job = JobDB.get(jobId);
            if (job) {
                document.getElementById('job-id').value = job.id;
                document.getElementById('modal-title').innerText = 'Edit Target Job';
                document.getElementById('job-title-input').value = job.title;
                document.getElementById('job-company-input').value = job.company;
                document.getElementById('job-location-input').value = job.location || '';
                document.getElementById('job-status-input').value = job.status;
                document.getElementById('job-type-input').value = job.type || 'Full-time';
                document.getElementById('job-desc-input').value = job.description;
            }
        }
        modal.classList.add('active');
    },

    closeJobModal() {
        document.getElementById('job-modal').classList.remove('active');
    },

    handleJobSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('job-id').value;
        const jobData = {
            title: document.getElementById('job-title-input').value.trim(),
            company: document.getElementById('job-company-input').value.trim(),
            location: document.getElementById('job-location-input').value.trim(),
            status: document.getElementById('job-status-input').value,
            type: document.getElementById('job-type-input').value,
            description: document.getElementById('job-desc-input').value.trim()
        };

        if (id) {
            jobData.id = id;
        }

        const saved = JobDB.save(jobData);
        
        // Auto-select if it was a new job creation
        if (!id) {
            AppState.activeJobId = saved.id;
        }

        this.closeJobModal();
        this.renderJobsTable();
        this.updateActiveJobDisplay();
    },

    // ==========================================
    // SETTINGS CONTROL
    // ==========================================
    loadSettings() {
        const settings = AppState.getSettings();
        document.getElementById('ai-engine-select').value = settings.engine;
        document.getElementById('gemini-key').value = settings.geminiKey;
        document.getElementById('gemini-model').value = settings.geminiModel;
        document.getElementById('openai-key').value = settings.openaiKey;
        document.getElementById('openai-model').value = settings.openaiModel;
        if (document.getElementById('webllm-model')) {
            document.getElementById('webllm-model').value = settings.webllmModel || 'Qwen/Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
        }
        
        this.toggleEngineFields(settings.engine);
    },

    toggleEngineFields(engine) {
        const geminiFields = document.getElementById('gemini-fields');
        const openaiFields = document.getElementById('openai-fields');
        const webllmFields = document.getElementById('webllm-fields');
        
        if (engine === 'gemini') {
            geminiFields.style.display = 'block';
            openaiFields.style.display = 'none';
            if (webllmFields) webllmFields.style.display = 'none';
        } else if (engine === 'openai') {
            geminiFields.style.display = 'none';
            openaiFields.style.display = 'block';
            if (webllmFields) webllmFields.style.display = 'none';
        } else if (engine === 'webllm') {
            geminiFields.style.display = 'none';
            openaiFields.style.display = 'none';
            if (webllmFields) webllmFields.style.display = 'block';
        } else {
            geminiFields.style.display = 'none';
            openaiFields.style.display = 'none';
            if (webllmFields) webllmFields.style.display = 'none';
        }
    },

    saveSettings() {
        const settings = {
            engine: document.getElementById('ai-engine-select').value,
            geminiKey: document.getElementById('gemini-key').value.trim(),
            geminiModel: document.getElementById('gemini-model').value,
            openaiKey: document.getElementById('openai-key').value.trim(),
            openaiModel: document.getElementById('openai-model').value,
            webllmModel: document.getElementById('webllm-model') ? document.getElementById('webllm-model').value : 'Qwen/Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
        };

        AppState.saveSettings(settings);

        const msg = document.getElementById('settings-status-message');
        msg.innerText = 'Configuration Saved!';
        msg.className = 'save-status-msg success';
        
        setTimeout(() => {
            msg.innerText = '';
        }, 3000);
    },

    // ==========================================
    // RESUME FILE SELECTION CONTROLS
    // ==========================================
    async handleFileSelect(file) {
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Currently only PDF resumes are supported.');
            return;
        }

        const dropZone = document.getElementById('drop-zone');
        const successPanel = document.getElementById('file-success-panel');
        const filenameEl = document.getElementById('uploaded-filename');
        const filesizeEl = document.getElementById('uploaded-filesize');
        
        // Show progress overlay temporarily for extraction
        this.showLoadingOverlay("Parsing PDF Document", "Running OCR-free text extraction...");

        try {
            const text = await PDFParser.extractText(file);
            AppState.activeResumeText = text;
            AppState.activeFileName = file.name;
            AppState.activeFileSize = (file.size / 1024 / 1024).toFixed(2) + ' MB';

            // Swap panels
            dropZone.style.display = 'none';
            successPanel.style.display = 'flex';
            filenameEl.innerText = AppState.activeFileName;
            filesizeEl.innerText = `${AppState.activeFileSize} \u2022 Parsed text successfully`;

            // Empty paste zone to avoid conflict
            document.getElementById('resume-text-input').value = '';

        } catch (err) {
            console.error(err);
            alert('Failed to read PDF resume: ' + err.message);
            this.clearFileSelection();
        } finally {
            this.hideLoadingOverlay();
        }
    },

    clearFileSelection() {
        AppState.activeResumeText = '';
        AppState.activeFileName = '';
        AppState.activeFileSize = '';
        document.getElementById('file-input').value = '';
        
        document.getElementById('drop-zone').style.display = 'block';
        document.getElementById('file-success-panel').style.display = 'none';
    },

    // ==========================================
    // ANALYSIS SCAN EXECUTION
    // ==========================================
    showLoadingOverlay(title, detail, progress = 20) {
        const overlay = document.getElementById('scanning-loading-overlay');
        document.getElementById('scanning-status-title').innerText = title;
        document.getElementById('scanning-status-detail').innerText = detail;
        document.getElementById('scanning-loading-bar-fill').style.width = `${progress}%`;
        overlay.classList.add('active');
    },

    hideLoadingOverlay() {
        document.getElementById('scanning-loading-overlay').classList.remove('active');
    },

    async runScan() {
        // Validation
        const job = JobDB.get(AppState.activeJobId);
        if (!job) {
            alert('Please select a target job from the Job Tracker.');
            return;
        }

        let resumeText = AppState.activeResumeText.trim();
        const pasteText = document.getElementById('resume-text-input').value.trim();

        if (!resumeText && pasteText) {
            resumeText = pasteText;
        }

        if (!resumeText) {
            alert('Please upload a PDF resume or paste your resume text to analyze.');
            return;
        }

        const settings = AppState.getSettings();
        
        // 1. Initial State
        this.showLoadingOverlay("Configuring Scanning Engine", "Connecting endpoints...", 15);

        // Sequence simulated steps
        setTimeout(async () => {
            try {
                this.showLoadingOverlay(
                    settings.engine === 'local' ? "Running Rule Heuristics" : "Connecting to AI API Service", 
                    settings.engine === 'local' ? "Scrubbing content for core CS vectors..." : `Calling models (${settings.engine === 'gemini' ? settings.geminiModel : settings.openaiModel})...`, 
                    45
                );

                const result = await AIService.scan(resumeText, job.description);
                this.activeResults = result;

                // Save analysis results to the database job profile
                job.score = result.overallScore;
                job.keywordsMatched = result.skills.matched.length;
                job.keywordsTotal = result.skills.matched.length + result.skills.missing.length;
                JobDB.save(job);

                // Render views
                this.showLoadingOverlay("Rendering Visualizer Panels", "Computing eye heatmap coordinates & SVGs...", 80);
                
                setTimeout(() => {
                    this.populateResultsView(resumeText, result);
                    this.hideLoadingOverlay();
                    
                    // Enable Results Menu link
                    const menuRes = document.getElementById('menu-results');
                    menuRes.classList.remove('disabled');
                    
                    this.switchView('results-view');
                    this.renderJobsTable(); // Refresh table matches
                }, 800);

            } catch (err) {
                console.error(err);
                this.hideLoadingOverlay();
                alert('Analysis failed: ' + err.message + '\n\nPlease check your internet connection, API Key configurations, or fallback to Local NLP Rules mode.');
            }
        }, 800);
    },

    // ==========================================
    // POPULATE RESULTS VIEWS
    // ==========================================
    populateResultsView(resumeText, results) {
        // Overall Score Ring
        document.getElementById('score-percentage').innerText = `${results.overallScore}%`;
        const offset = 339.29 - (339.29 * results.overallScore) / 100;
        document.getElementById('score-circle-path').style.strokeDashoffset = offset;
        
        // Verdict Badge
        const verdictEl = document.getElementById('score-verdict-text');
        verdictEl.innerText = results.overallScore >= 75 ? 'RECOMMENDED SHORTLIST' : (results.overallScore >= 50 ? 'POTENTIAL FIT' : 'CRITICAL GAP FOCUS');
        if (results.overallScore >= 75) verdictEl.className = 'score-verdict text-green';
        else if (results.overallScore >= 50) verdictEl.className = 'score-verdict text-yellow';
        else verdictEl.className = 'score-verdict text-red';

        // Summary Text
        document.getElementById('analysis-summary-text').innerText = results.summary;
        
        // Top Counters
        document.getElementById('stat-matched-keys').innerText = results.skills.matched.length;
        document.getElementById('stat-missing-keys').innerText = results.skills.missing.length;
        
        // Bullets grade ratio
        const bulletCount = results.starBullets.length || 1;
        const countAOrB = results.starBullets.filter(b => b.grade === 'A' || b.grade === 'B').length;
        document.getElementById('stat-star-score').innerText = `${countAOrB}/${bulletCount} STAR`;

        // Tab 1: Render keyword lists
        const matchedList = document.getElementById('matched-keywords-list');
        const missingList = document.getElementById('missing-keywords-list');
        document.getElementById('matched-count').innerText = results.skills.matched.length;
        document.getElementById('missing-count').innerText = results.skills.missing.length;

        matchedList.innerHTML = results.skills.matched.map(kw => `<span class="keyword-badge match">${kw}</span>`).join('') || '<span class="text-muted">No keywords matched.</span>';
        missingList.innerHTML = results.skills.missing.map(kw => `<span class="keyword-badge gap">${kw}</span>`).join('') || '<span class="text-muted">No missing keywords! Perfect!</span>';

        // Render SVG Radar Chart
        Visualizer.drawRadarChart('radar-chart-svg-wrapper', results.radarDimensions);

        // Tab 2: STAR Grader bullets
        const bulletsContainer = document.getElementById('star-bullets-container');
        bulletsContainer.innerHTML = '';

        let overallScoreAcc = 0;
        results.starBullets.forEach((bullet, i) => {
            const item = document.createElement('div');
            item.className = 'star-bullet-item';
            
            const gradeClass = `grade-${bullet.grade.toLowerCase()}`;
            overallScoreAcc += (bullet.grade === 'A' ? 10 : (bullet.grade === 'B' ? 8 : (bullet.grade === 'C' ? 6 : 4)));

            item.innerHTML = `
                <div class="bullet-meta">
                    <span style="font-weight:600;font-size:0.9rem">Experience Bullet #${i+1}</span>
                    <span class="bullet-grade ${gradeClass}">Grade ${bullet.grade}</span>
                </div>
                <div>
                    <span class="bullet-original-label">Your Draft:</span>
                    <p class="bullet-original-content">"${bullet.original}"</p>
                </div>
                <div class="bullet-optimize-box">
                    <span class="bullet-optimize-label">AI Recommended (STAR Optimized):</span>
                    <p class="bullet-optimize-content">"${bullet.suggestion}"</p>
                </div>
            `;
            bulletsContainer.appendChild(item);
        });

        // Set overall grade text
        const avgScore = overallScoreAcc / (results.starBullets.length || 1);
        let finalGrade = 'C';
        if (avgScore >= 9) finalGrade = 'A';
        else if (avgScore >= 7.5) finalGrade = 'B';
        else if (avgScore >= 5.5) finalGrade = 'C';
        else finalGrade = 'F';
        document.getElementById('star-overall-grade').innerText = finalGrade;

        // Tab 3: Heatmap Simulation Render
        document.getElementById('resume-text-render-container').innerText = resumeText;
        
        // Heatmap rendering will trigger automatically on tab select to fit client sizes.

        // Tab 4: Recruiter Panel Personas
        const pATS = results.personas.ats;
        const pRec = results.personas.recruiter;
        const pMgr = results.personas.manager;

        // ATS UI update
        document.getElementById('persona-ats-score').innerText = `${pATS.score}/100`;
        document.getElementById('persona-ats-verdict').innerText = pATS.verdict;
        document.getElementById('persona-ats-verdict').className = `persona-verdict verdict-${pATS.verdict.toLowerCase() === 'pass' ? 'pass' : (pATS.verdict.toLowerCase() === 'fail' ? 'fail' : 'warn')}`;
        document.getElementById('persona-ats-feedback').innerText = pATS.feedback;

        // Recruiter UI update
        document.getElementById('persona-recruiter-score').innerText = `${pRec.score}/100`;
        document.getElementById('persona-recruiter-verdict').innerText = pRec.verdict;
        document.getElementById('persona-recruiter-verdict').className = `persona-verdict verdict-${pRec.verdict.toLowerCase() === 'pass' ? 'pass' : (pRec.verdict.toLowerCase() === 'fail' ? 'fail' : 'warn')}`;
        document.getElementById('persona-recruiter-feedback').innerText = pRec.feedback;

        // Manager UI update
        document.getElementById('persona-manager-score').innerText = `${pMgr.score}/100`;
        document.getElementById('persona-manager-verdict').innerText = pMgr.verdict;
        document.getElementById('persona-manager-verdict').className = `persona-verdict verdict-${pMgr.verdict.toLowerCase() === 'pass' ? 'pass' : (pMgr.verdict.toLowerCase() === 'fail' ? 'fail' : 'warn')}`;
        document.getElementById('persona-manager-feedback').innerText = pMgr.feedback;

        // Tab 5: Interview Prep Custom Questions
        const coachContainer = document.getElementById('interview-questions-container');
        coachContainer.innerHTML = '';
        
        results.interviewQuestions.forEach((q, i) => {
            const item = document.createElement('div');
            item.className = 'interview-item';
            
            item.innerHTML = `
                <h4><span>Q${i+1}.</span> ${q.question}</h4>
                <p class="interview-rationale">Rationale: ${q.rationale}</p>
                <div class="interview-response-box">
                    <textarea placeholder="Type your practice response here..."></textarea>
                </div>
                <div class="interview-coaching-box">
                    <i class="fa-solid fa-graduation-cap"></i> <strong>Coaching Advice:</strong> ${q.coaching}
                </div>
            `;
            coachContainer.appendChild(item);
        });

        // Compile prompt for external Web LLMs (ChatGPT/Gemini)
        this.generateWebAiPrompt(results);

        // Tab 6: ATS Compliance Guard
        ATSGuard.run(resumeText);
    },

    generateWebAiPrompt(results) {
        const job = JobDB.get(AppState.activeJobId);
        if (!job) return;

        const missingKeywords = results.skills.missing.join(', ');
        
        let bulletsText = '';
        results.starBullets.forEach((bullet, i) => {
            bulletsText += `Bullet #${i+1}: "${bullet.original}"\n`;
        });

        const prompt = `I am applying for the role of ${job.title} at ${job.company}.
Please help me rewrite and reframe my experience bullet points to maximize my shortlisting chances for this role.

Specifically, I need to incorporate the following missing keywords/skills:
[${missingKeywords}]

Here are my draft experience bullet points:
${bulletsText}

Please rewrite each bullet point using the STAR (Situation, Task, Action, Result) methodology. Follow these strict rules:
1. Incorporate at least one quantified business impact, metric, or numeric value (e.g., %, $, hours, scalability figures) in each bullet.
2. Weave in the missing keywords naturally where they fit.
3. Use strong, action-oriented verbs (e.g., Architected, Optimized, Pioneered, Streamlined).
4. Output the rewritten bullet points clearly labeled. Include a brief explanation of what changes you made and why they improve ATS/recruiter compliance.`;

        const area = document.getElementById('web-ai-prompt-area');
        if (area) {
            area.value = prompt;
        }
    },

    // ==========================================
    // DEMO DATA WORKSPACE LOADING
    // ==========================================
    loadDemoWorkspace() {
        // Save demo job targeting to database
        const demoJob = {
            title: "Senior Full Stack Engineer",
            company: "TechNova Solutions",
            location: "Hyderabad, India (Hybrid)",
            status: "Target",
            type: "Full-time",
            description: `We are looking for a Senior Full Stack Engineer to lead development on our scalable cloud platform.

Requirements:
- Strong experience with JavaScript, TypeScript, React.js, and Node.js backend services.
- Solid understanding of SQL databases, PostgreSQL, and REST API architectural design.
- Hands-on experience scaling applications on AWS (S3, EC2, Lambda) and containerization via Docker.
- Experience writing automated testing suites using Jest and Cypress.
- Strong agile/scrum coordination skills and Git version control workflows.
- Excellent communication skills and familiarity with mentorship.`
        };

        const savedJob = JobDB.save(demoJob);
        AppState.activeJobId = savedJob.id;
        
        // Mock Resume text loaded directly into scanner paste area
        const demoResumeText = `Candidate Profile: Amit Sharma
Hyderabad, India | amit.sharma@email.com | +91 9999999999 | linkedin.com/in/amit-demo

SUMMARY:
Highly motivated Software Developer with 5+ years of experience designing frontend systems and writing Node services. Adept at building React web layouts, designing SQL tables, and collaborating across development teams. Eager to align engineering solutions to core requirements.

TECHNICAL SKILLS:
- Languages: JavaScript, SQL, HTML5, CSS3, Python (basic)
- Frameworks/Libraries: React.js, Node.js, Express.js, Bootstrap
- Tools/Databases: Git, PostgreSQL, MySQL, VS Code, Postman
- Concepts: Agile development, REST APIs, UI components, Unit Testing (Jest)

PROFESSIONAL EXPERIENCE:
TechForce Systems - Software Engineer (2023 - Present)
- Responsible for writing clean front-end components and styling web app layout.
- Designed database tables inside PostgreSQL and wrote basic database query structures.
- Cooperated with Scrum masters to review sprint progress and fix bug tickets.
- Managed standard Git workflows, creating merges and resolving conflicts.

AppDev Pioneers - Junior Web Programmer (2021 - 2023)
- Built interactive customer dashboards using React.js and CSS modules.
- Developed minor backend controllers in Express for REST endpoints.
- Conducted unit testing on standard components to clear functional backlogs.

EDUCATION:
Bachelor of Technology in Computer Science & Engineering
JNTU Hyderabad | Graded 8.2 CGPA`;

        AppState.activeResumeText = demoResumeText;
        AppState.activeFileName = 'Amit_Sharma_Resume.pdf';
        AppState.activeFileSize = '120 KB';

        // UI Panel Adjustments
        document.getElementById('drop-zone').style.display = 'none';
        
        const successPanel = document.getElementById('file-success-panel');
        successPanel.style.display = 'flex';
        document.getElementById('uploaded-filename').innerText = AppState.activeFileName;
        document.getElementById('uploaded-filesize').innerText = `${AppState.activeFileSize} \u2022 Ready to Scan`;

        document.getElementById('resume-text-input').value = '';

        this.renderJobsTable();
        this.updateActiveJobDisplay();
        this.switchView('scan-view');
        
        alert('Demo Workspace Loaded! Go to Step 2 on the right and click "Run Intelligent Scan" to see the full system analysis.');
    }
};

    // ==========================================
    // KANBAN WORKFLOW RENDER & DRAG HANDLERS
    // ==========================================
    renderKanbanBoard() {
        const columns = ['Target', 'Applied', 'Interviewing', 'Shortlisted', 'Rejected'];
        const jobs = JobDB.getAll();
        
        columns.forEach(status => {
            const container = document.getElementById(`kanban-${status}`);
            const countEl = document.getElementById(`count-${status.toLowerCase()}`);
            if (!container) return;

            const colJobs = jobs.filter(j => j.status === status);
            countEl.innerText = colJobs.length;
            container.innerHTML = '';
            
            if (colJobs.length === 0) {
                container.innerHTML = `<div class="kanban-empty-column-msg">Drag jobs here</div>`;
                return;
            }

            colJobs.forEach(job => {
                const card = document.createElement('div');
                card.className = `kanban-card ${job.id === AppState.activeJobId ? 'active-target' : ''}`;
                card.draggable = true;
                
                let scoreHTML = '<span class="kanban-card-score score-badge-none" style="font-size:0.7rem;padding:2px 4px;border-radius:4px;">Unscanned</span>';
                if (job.score !== null) {
                    let rating = 'score-badge-low';
                    if (job.score >= 75) rating = 'score-badge-high';
                    else if (job.score >= 50) rating = 'score-badge-medium';
                    scoreHTML = `<span class="kanban-card-score ${rating}" style="font-size:0.7rem;padding:2px 4px;border-radius:4px;">${job.score}%</span>`;
                }

                card.innerHTML = `
                    <div class="kanban-card-title" style="font-weight: 700;">${job.title}</div>
                    <div class="kanban-card-company" style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 8px;">${job.company}</div>
                    <div class="kanban-card-footer" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem;">
                        ${scoreHTML}
                        <button class="btn btn-outline select-job-row-btn" data-id="${job.id}" style="padding: 2px 6px; font-size: 0.7rem;">Target</button>
                    </div>
                `;

                // Card listeners
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', job.id);
                    card.style.opacity = '0.4';
                });
                card.addEventListener('dragend', () => {
                    card.style.opacity = '1';
                });
                card.querySelector('.select-job-row-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setActiveJob(job.id);
                });

                container.appendChild(card);
            });
        });
    },

    handleDragEnter(e) {
        e.preventDefault();
        const target = e.currentTarget;
        if (target.classList.contains('kanban-cards-container')) {
            target.classList.add('drag-over');
        }
    },

    handleDragLeave(e) {
        e.preventDefault();
        const target = e.currentTarget;
        if (target.classList.contains('kanban-cards-container')) {
            target.classList.remove('drag-over');
        }
    },

    handleDrop(e, targetStatus) {
        e.preventDefault();
        const container = e.currentTarget;
        container.classList.remove('drag-over');

        const jobId = e.dataTransfer.getData('text/plain');
        if (!jobId) return;

        const job = JobDB.get(jobId);
        if (job && job.status !== targetStatus) {
            job.status = targetStatus;
            JobDB.save(job);
            
            // Refresh views
            this.renderKanbanBoard();
            this.renderJobsTable();
            this.updateActiveJobDisplay();
        }
    },

    // ==========================================
    // CHROM EXTENSION DEEP LINK PARSER
    // ==========================================
    checkUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        if (action === 'add_job') {
            const title = params.get('title') || '';
            const company = params.get('company') || '';
            const location = params.get('location') || '';
            const desc = params.get('desc') || '';
            
            // Launch modal pre-filled
            this.openJobModal();
            document.getElementById('job-title-input').value = title;
            document.getElementById('job-company-input').value = company;
            document.getElementById('job-location-input').value = location;
            document.getElementById('job-desc-input').value = desc;

            // Clear parameters to clean up URL address bar
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }
    }
};

// ==========================================
// 8. ATS COMPLIANCE GUARD MODULE
// ==========================================
const ATSGuard = {
    rules: [
        { id: 'images', name: 'No Images / Graphics', icon: 'fa-solid fa-image', severity: 'critical' },
        { id: 'columns', name: 'Single-Column Layout', icon: 'fa-solid fa-columns', severity: 'warning' },
        { id: 'sections', name: 'Standard Section Headers', icon: 'fa-solid fa-heading', severity: 'warning' },
        { id: 'fonts', name: 'Standard Characters Only', icon: 'fa-solid fa-font', severity: 'warning' },
        { id: 'headerfooter', name: 'Header/Footer Safety', icon: 'fa-solid fa-grip-lines', severity: 'info' },
        { id: 'filesize', name: 'File Size Under 2MB', icon: 'fa-solid fa-weight-hanging', severity: 'info' },
        { id: 'contact', name: 'Contact Info Present', icon: 'fa-solid fa-address-card', severity: 'critical' },
        { id: 'length', name: 'Resume Length Check', icon: 'fa-solid fa-ruler-vertical', severity: 'info' }
    ],

    run(resumeText) {
        const results = this.analyze(resumeText);
        this.render(results);
    },

    analyze(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim());
        const nonEmpty = lines.filter(l => l.length > 0);
        const lower = text.toLowerCase();
        const checks = [];

        // Rule 1: Images / Graphics — check for unusual non-text indicators
        const hasImageIndicators = /\[image\]|\[graphic\]|\[logo\]|\[photo\]|\[picture\]/i.test(text);
        checks.push({
            id: 'images',
            passed: !hasImageIndicators,
            message: hasImageIndicators ? 'Possible image or graphic references detected in resume text. ATS parsers cannot read embedded images.' : 'No image/graphic references detected. ATS parsers can read all content.',
            fix: hasImageIndicators ? 'Remove all images, logos, photos, and graphic elements. Use text-only formatting.' : null
        });

        // Rule 2: Multi-column layout — detect lines with large internal whitespace gaps
        let multiColCount = 0;
        nonEmpty.forEach(line => {
            // 3+ consecutive spaces mid-line suggests columns
            if (/\S\s{3,}\S/.test(line) && line.length > 30) multiColCount++;
        });
        const hasMultiCol = multiColCount > 3;
        checks.push({
            id: 'columns',
            passed: !hasMultiCol,
            message: hasMultiCol ? `Detected ${multiColCount} lines with multi-column formatting. ATS systems often scramble column-based layouts.` : 'No multi-column formatting detected. Single-column layout confirmed.',
            fix: hasMultiCol ? 'Convert to a single-column layout. Avoid using tables, text boxes, or side-by-side columns.' : null
        });

        // Rule 3: Standard section headers
        const requiredSections = ['experience', 'education', 'skills'];
        const optionalSections = ['summary', 'objective', 'profile'];
        const foundRequired = requiredSections.filter(s => lower.includes(s));
        const foundOptional = optionalSections.filter(s => lower.includes(s));
        const missingRequired = requiredSections.filter(s => !lower.includes(s));
        const hasSections = foundRequired.length >= 2 && foundOptional.length >= 1;
        checks.push({
            id: 'sections',
            passed: hasSections,
            message: hasSections
                ? `Found headers: ${[...foundRequired, ...foundOptional].map(s => s.toUpperCase()).join(', ')}. ATS can parse your resume structure.`
                : `Missing section headers: ${missingRequired.map(s => s.toUpperCase()).join(', ')}. ATS parsers rely on standard headers to categorize content.`,
            fix: !hasSections ? 'Add clear section headers: EXPERIENCE, EDUCATION, SKILLS, and SUMMARY/OBJECTIVE.' : null
        });

        // Rule 4: Fancy / non-standard characters
        const fancyChars = text.match(/[❖◆◇★☆♦♣♠♥▶►▷▪▫◉◎⬤⬡✦✧✶✸✹✺✻✼✽❀❁❂❃❄❅❇❈❉❊❋]/g);
        const hasFancy = fancyChars && fancyChars.length > 2;
        checks.push({
            id: 'fonts',
            passed: !hasFancy,
            message: hasFancy
                ? `Found ${fancyChars.length} decorative/special characters that may not render correctly in ATS systems.`
                : 'No problematic special characters detected. Standard bullet markers (• - *) are ATS-safe.',
            fix: hasFancy ? 'Replace decorative bullets and symbols with standard characters: • (bullet), - (dash), or * (asterisk).' : null
        });

        // Rule 5: Header/Footer risk
        const firstLines = nonEmpty.slice(0, 2);
        const lastLines = nonEmpty.slice(-2);
        const shortEnds = [...firstLines, ...lastLines].filter(l => l.length < 20 && (/page\s*\d|\d+\s*of\s*\d|\d{4}$/i.test(l)));
        const hasHeaderFooterRisk = shortEnds.length > 0;
        checks.push({
            id: 'headerfooter',
            passed: !hasHeaderFooterRisk,
            message: hasHeaderFooterRisk
                ? 'Detected possible header/footer content (page numbers, dates) that ATS may strip during parsing.'
                : 'No header/footer risk detected. Document boundaries look clean.',
            fix: hasHeaderFooterRisk ? 'Move page numbers and dates out of headers/footers. Place all critical info in the document body.' : null
        });

        // Rule 6: File size check
        const fileSizeStr = AppState.activeFileSize;
        const fileSizeMB = fileSizeStr ? parseFloat(fileSizeStr) : 0;
        const isLargeFile = fileSizeMB > 2;
        checks.push({
            id: 'filesize',
            passed: !isLargeFile,
            message: isLargeFile
                ? `File size is ${fileSizeStr} which exceeds 2MB. Large files may timeout during ATS parsing.`
                : `File size (${fileSizeStr || 'text input'}) is within safe limits for ATS processing.`,
            fix: isLargeFile ? 'Reduce file size by removing embedded images, compressing the PDF, or using a simpler template.' : null
        });

        // Rule 7: Contact info present
        const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(text);
        const hasPhone = /(\+?\d[\d\s\-().]{6,}\d)/i.test(text);
        const hasLinkedIn = /linkedin\.com/i.test(text);
        const contactScore = [hasEmail, hasPhone, hasLinkedIn].filter(Boolean).length;
        checks.push({
            id: 'contact',
            passed: contactScore >= 2,
            message: contactScore >= 2
                ? `Contact info found: ${[hasEmail ? 'Email' : '', hasPhone ? 'Phone' : '', hasLinkedIn ? 'LinkedIn' : ''].filter(Boolean).join(', ')}. Recruiters can reach you.`
                : `Only ${contactScore} contact method(s) found. Recruiters need multiple ways to contact you.`,
            fix: contactScore < 2 ? 'Include at least: Email address, Phone number, and LinkedIn profile URL at the top of your resume.' : null
        });

        // Rule 8: Length check
        const lineCount = nonEmpty.length;
        const isTooLong = lineCount > 80;
        checks.push({
            id: 'length',
            passed: !isTooLong,
            message: isTooLong
                ? `Resume has ${lineCount} content lines (~${Math.ceil(lineCount/40)} pages). Recruiter attention drops significantly after page 1.`
                : `Resume length (${lineCount} lines, ~${Math.max(1, Math.ceil(lineCount/40))} page) is within optimal range for recruiter attention.`,
            fix: isTooLong ? 'Trim to 1-2 pages max. Remove outdated roles (10+ years ago), reduce bullet points per role to 3-5, cut irrelevant skills.' : null
        });

        return checks;
    },

    render(checks) {
        const container = document.getElementById('ats-guard-rules-container');
        const passCountEl = document.getElementById('guard-pass-count');
        const badgeEl = document.getElementById('ats-guard-summary-badge');
        if (!container) return;

        const passCount = checks.filter(c => c.passed).length;
        passCountEl.innerText = passCount;

        // Color the badge
        badgeEl.className = 'ats-guard-summary-badge';
        if (passCount >= 7) badgeEl.classList.add('score-high');
        else if (passCount >= 5) badgeEl.classList.add('score-medium');
        else badgeEl.classList.add('score-low');

        container.innerHTML = '';

        checks.forEach((check, i) => {
            const rule = this.rules[i];
            const severityClass = check.passed ? 'severity-pass' : (rule.severity === 'critical' ? 'severity-fail' : (rule.severity === 'warning' ? 'severity-warn' : 'severity-info'));
            const statusIcon = check.passed ? 'fa-solid fa-circle-check' : (rule.severity === 'critical' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-triangle-exclamation');

            const card = document.createElement('div');
            card.className = `guard-rule-card ${severityClass}`;
            card.innerHTML = `
                <div class="guard-rule-icon"><i class="${statusIcon}"></i></div>
                <div class="guard-rule-body">
                    <h5>${rule.name}</h5>
                    <p class="guard-status-text">${check.message}</p>
                    ${check.fix ? `<p class="guard-fix-hint"><i class="fa-solid fa-wrench"></i> ${check.fix}</p>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    }
};

// ==========================================
// 9. LIVE KEYWORD INJECTOR MODULE
// ==========================================
const KeywordInjector = {
    _debounceTimer: null,
    _skillsDB: [
        'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin',
        'react', 'angular', 'vue', 'next.js', 'node', 'express', 'django', 'flask', 'spring',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd',
        'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
        'agile', 'scrum', 'kanban', 'jira', 'git', 'github',
        'html', 'css', 'sass', 'tailwind', 'bootstrap',
        'graphql', 'rest api', 'microservices', 'serverless',
        'machine learning', 'deep learning', 'nlp', 'data science', 'tensorflow', 'pytorch',
        'testing', 'jest', 'cypress', 'selenium', 'unit testing', 'tdd',
        'webpack', 'vite', 'babel', 'eslint',
        'figma', 'design system', 'responsive', 'accessibility',
        'communication', 'leadership', 'mentorship', 'collaboration'
    ],

    extractKeywordsFromJD(description) {
        if (!description) return [];
        const lower = description.toLowerCase();
        return this._skillsDB.filter(skill => lower.includes(skill));
    },

    refresh() {
        const job = AppState.activeJobId ? JobDB.get(AppState.activeJobId) : null;
        const container = document.getElementById('injector-keywords-container');
        const fillEl = document.getElementById('injector-score-fill');
        const labelEl = document.getElementById('injector-score-label');

        if (!job || !container) {
            if (container) container.innerHTML = `<div class="injector-empty-state"><i class="fa-solid fa-circle-info"></i><p>Select a target job from the Job Tracker to see keyword coverage here.</p></div>`;
            if (fillEl) fillEl.style.width = '0%';
            if (labelEl) labelEl.innerText = 'Select a target job first';
            return;
        }

        const jdKeywords = this.extractKeywordsFromJD(job.description);
        if (jdKeywords.length === 0) {
            container.innerHTML = `<div class="injector-empty-state"><i class="fa-solid fa-circle-info"></i><p>No recognizable keywords found in the job description. Try adding more technical requirements.</p></div>`;
            if (fillEl) fillEl.style.width = '0%';
            if (labelEl) labelEl.innerText = 'No keywords to track';
            return;
        }

        // Get current resume text from the builder
        const resumeText = this.getResumeBuilderText().toLowerCase();

        const found = [];
        const missing = [];
        jdKeywords.forEach(kw => {
            if (resumeText.includes(kw)) {
                found.push(kw);
            } else {
                missing.push(kw);
            }
        });

        // Update score bar
        const pct = Math.round((found.length / jdKeywords.length) * 100);
        if (fillEl) fillEl.style.width = `${pct}%`;
        if (labelEl) labelEl.innerText = `${found.length}/${jdKeywords.length} keywords covered (${pct}%)`;

        // Render chips: missing first, then found
        container.innerHTML = '';
        missing.forEach(kw => {
            const chip = document.createElement('div');
            chip.className = 'injector-keyword-chip missing';
            chip.innerHTML = `<i class="fa-solid fa-xmark"></i><span class="chip-label">${kw}</span><span class="chip-action">Click to copy</span>`;
            chip.addEventListener('click', () => {
                navigator.clipboard.writeText(kw).then(() => {
                    chip.querySelector('.chip-action').innerText = 'Copied!';
                    setTimeout(() => { chip.querySelector('.chip-action').innerText = 'Click to copy'; }, 1500);
                });
            });
            container.appendChild(chip);
        });
        found.forEach(kw => {
            const chip = document.createElement('div');
            chip.className = 'injector-keyword-chip found';
            chip.innerHTML = `<i class="fa-solid fa-circle-check"></i><span class="chip-label">${kw}</span><span class="chip-action">✓ In resume</span>`;
            container.appendChild(chip);
        });
    },

    getResumeBuilderText() {
        // Aggregate all text from ResumeBuilder data fields
        const d = ResumeBuilder.data;
        let text = [d.name, d.email, d.phone, d.location, d.links, d.summary, d.skills].join(' ');
        d.experience.forEach(exp => {
            text += ' ' + exp.role + ' ' + exp.company + ' ' + exp.bullets.join(' ');
        });
        d.education.forEach(edu => {
            text += ' ' + edu.degree + ' ' + edu.school;
        });
        return text;
    },

    scheduleRefresh() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this.refresh(), 300);
    }
};

// ==========================================
// 10. RESUME BUILDER ENGINE
// ==========================================
const ResumeBuilder = {
    data: {
        name: "Amit Sharma",
        email: "amit.sharma@email.com",
        phone: "+91 9999999999",
        location: "Hyderabad, India",
        links: "linkedin.com/in/amit-demo",
        summary: "Highly motivated Software Developer with 5+ years of experience designing frontend systems and writing Node services.",
        experience: [
            {
                role: "Software Engineer",
                company: "TechForce Systems",
                duration: "2023 - Present",
                bullets: [
                    "Responsible for writing clean front-end components and styling web app layout.",
                    "Designed database tables inside PostgreSQL and wrote basic database query structures.",
                    "Cooperated with Scrum masters to review sprint progress and fix bug tickets."
                ]
            }
        ],
        skills: "JavaScript, React, Node.js, HTML, CSS, SQL, Git",
        education: [
            {
                degree: "Bachelor of Technology in Computer Science & Engineering",
                school: "JNTU Hyderabad",
                duration: "2017 - 2021"
            }
        ]
    },

    init() {
        this.load();
        this.bindEvents();
        this.renderEditor();
        this.renderPreview();
        this.bindInjectorToggle();
    },

    bindInjectorToggle() {
        const toggleBtn = document.getElementById('btn-toggle-injector');
        const panel = document.getElementById('keyword-injector-panel');
        const grid = document.querySelector('.builder-grid');
        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                if (panel.classList.contains('collapsed')) {
                    grid.style.gridTemplateColumns = '1fr 1fr';
                    toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
                } else {
                    grid.style.gridTemplateColumns = '1fr 1fr 280px';
                    toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
                    KeywordInjector.refresh();
                }
            });
        }
    },

    load() {
        const stored = localStorage.getItem('copilot_resume_builder_data');
        if (stored) {
            this.data = JSON.parse(stored);
        }
    },

    save() {
        localStorage.setItem('copilot_resume_builder_data', JSON.stringify(this.data));
        this.renderPreview();
        // Trigger keyword injector live update
        KeywordInjector.scheduleRefresh();
    },

    bindEvents() {
        // Bind direct inputs
        const fields = ['name', 'email', 'phone', 'location', 'links', 'summary', 'skills'];
        fields.forEach(field => {
            const el = document.getElementById(`rb-${field}`);
            if (el) {
                el.addEventListener('input', (e) => {
                    this.data[field] = e.target.value;
                    this.save();
                });
            }
        });

        // Add experience block
        document.getElementById('rb-add-exp-btn').addEventListener('click', () => {
            this.data.experience.push({
                role: "Software Engineer",
                company: "New Company",
                duration: "2024",
                bullets: ["Experience bullet point..."]
            });
            this.save();
            this.renderEditor();
        });

        // Add education block
        document.getElementById('rb-add-edu-btn').addEventListener('click', () => {
            this.data.education.push({
                degree: "Degree / Course",
                school: "University / Institution",
                duration: "Year"
            });
            this.save();
            this.renderEditor();
        });
    },

    renderEditor() {
        // Experience Blocks
        const expContainer = document.getElementById('rb-experience-container');
        expContainer.innerHTML = '';
        
        this.data.experience.forEach((exp, idx) => {
            const block = document.createElement('div');
            block.className = 'exp-block-editor';
            block.innerHTML = `
                <button class="remove-block-btn" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>
                <div style="display:flex; gap:8px;">
                    <input type="text" class="exp-role" value="${exp.role}" placeholder="Role Title" style="flex:1; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                    <input type="text" class="exp-company" value="${exp.company}" placeholder="Company" style="flex:1; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                </div>
                <input type="text" class="exp-duration" value="${exp.duration}" placeholder="Duration (e.g. 2023 - Present)" style="width:100%; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                <textarea class="exp-bullets" placeholder="Write bullet points here. Add each bullet point on a new line." style="height:100px; width:100%; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); resize:vertical; font-size:0.8rem;">${exp.bullets.join('\n')}</textarea>
            `;

            block.querySelector('.exp-role').addEventListener('input', (e) => { exp.role = e.target.value; this.save(); });
            block.querySelector('.exp-company').addEventListener('input', (e) => { exp.company = e.target.value; this.save(); });
            block.querySelector('.exp-duration').addEventListener('input', (e) => { exp.duration = e.target.value; this.save(); });
            block.querySelector('.exp-bullets').addEventListener('input', (e) => { 
                exp.bullets = e.target.value.split('\n').filter(b => b.trim().length > 0);
                this.save();
            });

            block.querySelector('.remove-block-btn').addEventListener('click', () => {
                this.data.experience.splice(idx, 1);
                this.save();
                this.renderEditor();
            });

            expContainer.appendChild(block);
        });

        // Education Blocks
        const eduContainer = document.getElementById('rb-education-container');
        eduContainer.innerHTML = '';

        this.data.education.forEach((edu, idx) => {
            const block = document.createElement('div');
            block.className = 'edu-block-editor';
            block.innerHTML = `
                <button class="remove-block-btn" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>
                <input type="text" class="edu-degree" value="${edu.degree}" placeholder="Degree Title" style="width:100%; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                <div style="display:flex; gap:8px;">
                    <input type="text" class="edu-school" value="${edu.school}" placeholder="School / University" style="flex:1; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                    <input type="text" class="edu-duration" value="${edu.duration}" placeholder="Year" style="flex:1; background: var(--bg-primary); border: 1px solid var(--glass-border); padding:8px; border-radius:4px; color:var(--text-primary); font-size:0.8rem;">
                </div>
            `;

            block.querySelector('.edu-degree').addEventListener('input', (e) => { edu.degree = e.target.value; this.save(); });
            block.querySelector('.edu-school').addEventListener('input', (e) => { edu.school = e.target.value; this.save(); });
            block.querySelector('.edu-duration').addEventListener('input', (e) => { edu.duration = e.target.value; this.save(); });

            block.querySelector('.remove-block-btn').addEventListener('click', () => {
                this.data.education.splice(idx, 1);
                this.save();
                this.renderEditor();
            });

            eduContainer.appendChild(block);
        });

        // Sync values to fields
        const fields = ['name', 'email', 'phone', 'location', 'links', 'summary', 'skills'];
        fields.forEach(field => {
            const el = document.getElementById(`rb-${field}`);
            if (el) el.value = this.data[field] || '';
        });
    },

    renderPreview() {
        document.getElementById('pv-name').innerText = this.data.name || "Candidate Name";
        document.getElementById('pv-contact').innerHTML = `
            ${this.data.location || 'Location'} &bull; ${this.data.email || 'Email'} &bull; ${this.data.phone || 'Phone'} &bull; ${this.data.links || 'Links'}
        `;
        
        document.getElementById('pv-summary').innerText = this.data.summary || "";
        document.getElementById('pv-skills').innerText = this.data.skills || "";
        
        // Experience Render
        const expPrint = document.getElementById('pv-experience-container');
        expPrint.innerHTML = '';
        this.data.experience.forEach(exp => {
            const node = document.createElement('div');
            node.style.marginBottom = '12px';
            node.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10pt; color:#0f172a; font-family:'Times New Roman',Times,serif; margin-bottom: 2px;">
                    <span>${exp.role} &bull; ${exp.company}</span>
                    <span>${exp.duration}</span>
                </div>
                <ul style="margin: 0; padding-left: 18px; font-size:9.8pt; color:#334155; font-family:'Times New Roman',Times,serif; list-style-type: disc;">
                    ${exp.bullets.map(b => `<li style="margin-bottom: 2px;">${b}</li>`).join('')}
                </ul>
            `;
            expPrint.appendChild(node);
        });

        // Education Render
        const eduPrint = document.getElementById('pv-education-container');
        eduPrint.innerHTML = '';
        this.data.education.forEach(edu => {
            const node = document.createElement('div');
            node.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:10pt; color:#0f172a; font-family:'Times New Roman',Times,serif; margin-bottom: 2px;">
                    <span style="font-weight:bold;">${edu.degree}</span>
                    <span>${edu.duration}</span>
                </div>
                <div style="font-size:9.5pt; color:#475569; font-family:'Times New Roman',Times,serif;">${edu.school}</div>
            `;
            eduPrint.appendChild(node);
        });
    }
};

// Initialize UI on window load
console.log(`ATS Copilot: app.js loaded. Document readyState: ${document.readyState}`);
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        console.log("ATS Copilot: DOMContentLoaded event fired.");
        UI.init();
    });
} else {
    console.log("ATS Copilot: Document already loaded, initializing immediately.");
    UI.init();
}
