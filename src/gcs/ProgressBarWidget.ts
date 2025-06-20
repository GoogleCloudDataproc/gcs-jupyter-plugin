// In ProgressBarWidget.ts
import { Widget } from '@lumino/widgets';

const PROGRESS_BAR_CLASS = 'jp-InlineCompleter-progressBar';

export class ProgressBarWidget extends Widget {
  constructor() {
    super();

    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = PROGRESS_BAR_CLASS;
    
    this.node.appendChild(progressBarContainer); 

    this.hide(); // Initial state is hidden
  }

  public show(): void {
    this.node.classList.remove('lm-mod-hidden'); // 
    this.node.style.display = 'flex'; 
  }

  public hide(): void {
    this.node.classList.add('lm-mod-hidden'); 
    this.node.style.display = 'none';
  }
}

