/**
 * Custom Modal System
 * Replaces browser's alert() and confirm() with styled modals
 */

class CustomModal {
    constructor() {
        this.overlay = null;
        this.createOverlay();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        document.body.appendChild(this.overlay);
    }

    confirm(message, title = "Confirm", options = {}) {
        return new Promise((resolve) => {
            const {
                confirmText = "Confirm",
                cancelText = "Cancel",
                icon = "⚠️",
                iconClass = "warning"
            } = options;

            this.overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <span class="modal-icon ${iconClass}">${icon}</span>
                        <h2 class="modal-title">${title}</h2>
                    </div>
                    <div class="modal-content">${message}</div>
                    <div class="modal-buttons">
                        <button class="modal-button secondary" data-action="cancel">${cancelText}</button>
                        <button class="modal-button danger" data-action="confirm">${confirmText}</button>
                    </div>
                </div>
            `;

            requestAnimationFrame(() => {
                this.overlay.classList.add('show');
            });

            const handleClick = (e) => {
                const action = e.target.dataset.action;
                if (action) {
                    this.hide();
                    resolve(action === 'confirm');
                    cleanup();
                }
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    this.hide();
                    resolve(false);
                    cleanup();
                }
            };

            const handleOutsideClick = (e) => {
                if (e.target === this.overlay) {
                    this.hide();
                    resolve(false);
                    cleanup();
                }
            };

            const cleanup = () => {
                this.overlay.removeEventListener('click', handleClick);
                this.overlay.removeEventListener('click', handleOutsideClick);
                document.removeEventListener('keydown', handleEscape);
            };

            this.overlay.addEventListener('click', handleClick);
            this.overlay.addEventListener('click', handleOutsideClick);
            document.addEventListener('keydown', handleEscape);
        });
    }

    alert(message, title = "Alert", options = {}) {
        return new Promise((resolve) => {
            const {
                okText = "OK",
                icon = "ℹ️",
                iconClass = "info"
            } = options;

            this.overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <span class="modal-icon ${iconClass}">${icon}</span>
                        <h2 class="modal-title">${title}</h2>
                    </div>
                    <div class="modal-content">${message}</div>
                    <div class="modal-buttons">
                        <button class="modal-button primary" data-action="ok">${okText}</button>
                    </div>
                </div>
            `;

            requestAnimationFrame(() => {
                this.overlay.classList.add('show');
            });

            const handleClick = (e) => {
                if (e.target.dataset.action === 'ok') {
                    this.hide();
                    resolve();
                    cleanup();
                }
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    this.hide();
                    resolve();
                    cleanup();
                }
            };

            const handleOutsideClick = (e) => {
                if (e.target === this.overlay) {
                    this.hide();
                    resolve();
                    cleanup();
                }
            };

            const cleanup = () => {
                this.overlay.removeEventListener('click', handleClick);
                this.overlay.removeEventListener('click', handleOutsideClick);
                document.removeEventListener('keydown', handleEscape);
            };

            this.overlay.addEventListener('click', handleClick);
            this.overlay.addEventListener('click', handleOutsideClick);
            document.addEventListener('keydown', handleEscape);
        });
    }

    hide() {
        this.overlay.classList.remove('show');
    }
}

// Create global instance
const modal = new CustomModal();

// Global helper functions
window.customConfirm = (message, title, options) => modal.confirm(message, title, options);
window.customAlert = (message, title, options) => modal.alert(message, title, options);