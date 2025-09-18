function waitForClosePopup(popupContainer: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            if (!document.body.contains(popupContainer) || popupContainer.style.display === "none") {
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

function showSingleRowPasteDialog(): Promise<string[] | null> {
    return new Promise(resolve => {
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

        dialog.innerHTML = `
            <p>Paste values from Excel (single row):</p>
            <textarea id="pasteInput" style="width:100%; height:200px; font-size:16px;"></textarea>
            <div style="margin-top:10px;">
                <button id="pasteOkBtn">OK</button>
                <button id="pasteCancelBtn">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector<HTMLTextAreaElement>('#pasteInput')!;
        const okBtn = dialog.querySelector<HTMLButtonElement>('#pasteOkBtn')!;
        const cancelBtn = dialog.querySelector<HTMLButtonElement>('#pasteCancelBtn')!;

        okBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return;
            // Split by tabs and trim each value
            const values = text.split('\t').map(v => v.trim());
            resolve(values);
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
function getNextParams(baselineUnits: number[], index: number, dialogParams: string[]): number {
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
  dialogParams[1] = "2026" + startWeek.toString().padStart(2, '0');
  dialogParams[2] = "2026" + endWeek.toString().padStart(2, '0');

  index++;
  return index;
}

async function doDialog(dialogParams: string[]): Promise<boolean> {
    const CONFIG = {
      buttonId: "s_3_1_12_0_Ctrl" // button "Mass Change"
    };

    // Click the button to open the dialog
    const button = document.getElementById(CONFIG.buttonId);
    if (button) button.click();

    // Wait a bit for dialog to appear
    await new Promise((r) => setTimeout(r, 500));

    // Find the container
    const container = Array.from(document.querySelectorAll('div[role="dialog"]')).find(dialog => {
        const style = window.getComputedStyle(dialog);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }) as HTMLElement;

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
  // Main dialog automation
  (async function run() {
    const values = await showSingleRowPasteDialog();
    console.log(values);
    if (!values) {
      return;
    }

    if (values.length < 52) {
      window.alert("Wrong input!");
      return;
    }

    const baselineUnits: number[] = [];
    values.forEach(element => {
      baselineUnits.push(+element.replace(",", ""));
    });

    const dialogParams: string[] = ["", "", ""];

    let index = 0;
    while (index < 51) {
      index = getNextParams(baselineUnits, index, dialogParams);
      await doDialog(dialogParams);
    }
  })();
})();
