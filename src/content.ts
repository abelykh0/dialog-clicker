function waitForClosePopup(popupContainer: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
        const isClosed = () =>
            !document.body.contains(popupContainer) || popupContainer.style.display === "none";

        if (isClosed()) {
            setTimeout(resolve, 200);
            return;
        }

        const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Dialog did not close"));
        }, 30_000);

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
async function loadSettings(): Promise<{ year: string }> {
    return new Promise((resolve) => {
        chrome.storage.local.get(["dialogSettings"], (res) => {
            resolve(res.dialogSettings || { year: String(new Date().getFullYear()) });
        });
    });
}

// Save settings
function saveSettings(settings: { year: string }) {
    chrome.storage.local.set({ dialogSettings: settings });
}

function showSingleRowPasteDialog(): Promise<{ level: string; text: string; year: string } | null> {
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

        dialog.innerHTML = await fetch(chrome.runtime.getURL('dialog.html')).then(r => r.text());

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const yearSelect = dialog.querySelector<HTMLSelectElement>("#yearSelect")!;
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear, currentYear + 1];
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        });
        yearSelect.value = years.includes(Number(saved.year)) ? saved.year : String(currentYear);

        const input = dialog.querySelector<HTMLTextAreaElement>('#pasteInput')!;
        const okBtn = dialog.querySelector<HTMLButtonElement>('#okBtn')!;
        const cancelBtn = dialog.querySelector<HTMLButtonElement>('#cancelBtn')!;

        okBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) {
                resolve(null);
            } else {
                const radios = dialog.querySelectorAll<HTMLInputElement>('input[name="level"]');
                let selected = "MPG";
                radios.forEach(r => {
                  if (r.checked) selected = r.value;
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
function getNextParams(baselineUnits: number[], index: number, year: string, dialogParams: string[]): number {
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

async function doDialog(level: string, dialogParams: string[]): Promise<boolean> {
    const CONFIG = {
      buttonMassChangeMpg: "s_3_1_12_0_Ctrl", // button "Mass Change" on MPG Baseline
      buttonMassChangeUpc: "s_4_1_10_0_Ctrl"  // button "Mass Change" on Product Baseline
    };

    // Click the button to open the dialog
    let button;
    if (level === "UPC") {
      button = document.getElementById(CONFIG.buttonMassChangeUpc);
    }
    else {
      button = document.getElementById(CONFIG.buttonMassChangeMpg);
    }
    
    if (button) button.click();

    // Find the container
    let container;
    for (let i = 0; i < 10; i++) {
      container = Array.from(document.querySelectorAll('div[role="dialog"]')).find(dialog => {
          const style = window.getComputedStyle(dialog);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }) as HTMLElement;

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
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input")).slice(2);
    inputs.forEach((input, index) => {
      if (index < dialogParams.length) {
        input.focus();
        input.value = dialogParams[index];
        input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      }
    });

    // Click the OK button
    const okButton = container.querySelector<HTMLButtonElement>(
      'button[data-display="Execute"]'
    );
    if (!okButton) {
      return false;
    }
      
    okButton.click();
    await waitForClosePopup(container);
    return true;
}

(function () {
  if ((window as any).__dialogClickerActive) return;
  (window as any).__dialogClickerActive = true;

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

    const baselineUnits: number[] = [];
    values.forEach(element => {
      baselineUnits.push(+element.replace(/,/g, ""));
    });

    const dialogParams: string[] = ["", "", ""];

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
    (window as any).__dialogClickerActive = false;
  });
})();
