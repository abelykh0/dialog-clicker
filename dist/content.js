"use strict";
function waitForClosePopup(popupContainer) {
    return new Promise((resolve, reject) => {
        const isClosed = () => !document.body.contains(popupContainer) || popupContainer.style.display === "none";
        if (isClosed()) {
            setTimeout(resolve, 200);
            return;
        }
        const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Dialog did not close"));
        }, 30000);
        const observer = new MutationObserver(() => {
            if (isClosed()) {
                observer.disconnect();
                clearTimeout(timeout);
                setTimeout(resolve, 200);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}
// Load saved settings
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["dialogSettings"], (res) => {
            resolve(res.dialogSettings || { year: String(new Date().getFullYear()) });
        });
    });
}
// Save settings
function saveSettings(settings) {
    chrome.storage.local.set({ dialogSettings: settings });
}
function showSingleRowPasteDialog() {
    return new Promise(async (resolve) => {
        const saved = await loadSettings();
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top:0; left:0; width:100%; height:100%;
            background-color: rgba(0,0,0,0.3); display:flex;
            align-items:center; justify-content:center; z-index:9999;
        `;
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background:white; padding:20px; border-radius:8px;
            box-shadow:0 4px 10px rgba(0,0,0,0.3); text-align:center;
            max-width:600px; width:90%;
        `;
        dialog.innerHTML = await Promise.resolve("<label><input type=\"radio\" name=\"level\" value=\"MPG\" checked> MPG Level</label>\n\n<label style=\"margin-left:15px;\"><input type=\"radio\" name=\"level\" value=\"UPC\"> UPC Level</label>\n\n<div style=\"margin-bottom:15px;\">\n  <label for=\"yearSelect\">Year:</label>\n  <select id=\"yearSelect\" style=\"margin-left:8px; padding:3px 6px;\"></select>\n</div>\n\n<p style=\"margin-top:15px;\">Paste values from Excel (single row):</p>\n<textarea id=\"pasteInput\" style=\"width:100%; height:150px; font-size:16px;\"></textarea>\n<div style=\"margin-top:15px;\">\n<button id=\"okBtn\" style=\"\n    background-color:#007bff;\n    color:white;\n    border:none;\n    border-radius:4px;\n    padding:6px 14px;\n    margin-right:8px;\n    cursor:pointer;\n    font-size:14px;\n\">OK</button>\n<button id=\"cancelBtn\" style=\"\n    background-color:#f0f0f0;\n    color:#333;\n    border:1px solid #ccc;\n    border-radius:4px;\n    padding:6px 14px;\n    cursor:pointer;\n    font-size:14px;\n\">Cancel</button>\n</div>\n");
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const yearSelect = dialog.querySelector("#yearSelect");
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear, currentYear + 1];
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        });
        yearSelect.value = years.includes(Number(saved.year)) ? saved.year : String(currentYear);
        const input = dialog.querySelector('#pasteInput');
        const okBtn = dialog.querySelector('#okBtn');
        const cancelBtn = dialog.querySelector('#cancelBtn');
        okBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) {
                resolve(null);
            }
            else {
                const radios = dialog.querySelectorAll('input[name="level"]');
                let selected = "MPG";
                radios.forEach(r => {
                    if (r.checked)
                        selected = r.value;
                });
                // Save settings
                const settings = { year: yearSelect.value };
                saveSettings(settings);
                resolve({ level: selected, text, year: yearSelect.value });
            }
            document.body.removeChild(overlay);
        });
        cancelBtn.addEventListener('click', () => {
            resolve(null);
            document.body.removeChild(overlay);
        });
        input.focus();
    });
}
// returns next index
function getNextParams(baselineUnits, index, year, dialogParams) {
    // Skip first
    if (index === 0) {
        index++;
    }
    const startWeek = index + 1;
    let endWeek = startWeek;
    while (index < 51 && baselineUnits[index] === baselineUnits[index + 1]) {
        index++;
        endWeek++;
    }
    // Skip 52
    if (endWeek === 52) {
        endWeek = 51;
    }
    const currentValue = baselineUnits[index];
    dialogParams[0] = currentValue.toString();
    dialogParams[1] = year + startWeek.toString().padStart(2, '0');
    dialogParams[2] = year + endWeek.toString().padStart(2, '0');
    index++;
    return index;
}
async function doDialog(level, dialogParams) {
    const CONFIG = {
        buttonMassChangeMpg: "s_3_1_12_0_Ctrl", // button "Mass Change" on MPG Baseline
        buttonMassChangeUpc: "s_4_1_10_0_Ctrl" // button "Mass Change" on Product Baseline
    };
    // Click the button to open the dialog
    let button;
    if (level === "UPC") {
        button = document.getElementById(CONFIG.buttonMassChangeUpc);
    }
    else {
        button = document.getElementById(CONFIG.buttonMassChangeMpg);
    }
    if (button)
        button.click();
    // Find the container
    let container;
    for (let i = 0; i < 10; i++) {
        container = Array.from(document.querySelectorAll('div[role="dialog"]')).find(dialog => {
            const style = window.getComputedStyle(dialog);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        // Wait a bit for dialog to appear
        await new Promise((r) => setTimeout(r, 200));
        if (container) {
            break;
        }
    }
    if (!container) {
        return false;
    }
    // Fill all input fields in order
    const inputs = Array.from(container.querySelectorAll("input")).slice(2);
    inputs.forEach((input, index) => {
        if (index < dialogParams.length) {
            input.focus();
            input.value = dialogParams[index];
            input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        }
    });
    // Click the OK button
    const okButton = container.querySelector('button[data-display="Execute"]');
    if (!okButton) {
        return false;
    }
    okButton.click();
    await waitForClosePopup(container);
    return true;
}
(function () {
    if (window.__dialogClickerActive)
        return;
    window.__dialogClickerActive = true;
    (async function run() {
        const result = await showSingleRowPasteDialog();
        if (!result) {
            return;
        }
        const values = result.text.split('\t').map(s => s.trim());
        if (values.length < 52) {
            window.alert("Wrong input!");
            return;
        }
        const baselineUnits = [];
        values.forEach(element => {
            baselineUnits.push(+element.replace(/,/g, ""));
        });
        const dialogParams = ["", "", ""];
        let index = 0;
        while (index < 51) {
            index = getNextParams(baselineUnits, index, result.year, dialogParams);
            if (dialogParams[0] === "NaN") {
                continue;
            }
            const dialogResult = await doDialog(result.level, dialogParams);
            if (!dialogResult) {
                window.alert("Failed");
                break;
            }
        }
    })().finally(() => {
        window.__dialogClickerActive = false;
    });
})();
