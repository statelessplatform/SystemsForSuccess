// ========================================
// SYSTEMS FOR SUCCESS - APP LOGIC
// Headspace-Inspired with Gamification
// ========================================

// ========== IndexedDB Setup ==========
const DB_NAME = 'SystemsForSuccessDB';
const DB_VERSION = 1;
let db = null;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Create systems store
            if (!database.objectStoreNames.contains('systems')) {
                database.createObjectStore('systems', { keyPath: 'id' });
            }

            // Create app state store
            if (!database.objectStoreNames.contains('appState')) {
                database.createObjectStore('appState', { keyPath: 'key' });
            }

            // Create achievements store
            if (!database.objectStoreNames.contains('achievements')) {
                database.createObjectStore('achievements', { keyPath: 'id' });
            }
        };
    });
}

async function saveToIndexedDB(storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromIndexedDB(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ========== Gamification System ==========
const Achievements = {
    badges: [
        { id: 'first_system', icon: '🎯', title: 'First Steps', description: 'Create your first system', unlocked: false },
        { id: 'streak_3', icon: '🔥', title: 'On Fire', description: '3-day streak', unlocked: false },
        { id: 'streak_7', icon: '⚡', title: 'Unstoppable', description: '7-day streak', unlocked: false },
        { id: 'complete_10', icon: '💪', title: 'Go-Getter', description: 'Complete 10 tasks', unlocked: false },
        { id: 'complete_50', icon: '🏆', title: 'Champion', description: 'Complete 50 tasks', unlocked: false },
        { id: 'perfect_day', icon: '✨', title: 'Perfect Day', description: 'Complete all tasks in a day', unlocked: false },
        { id: 'early_bird', icon: '🌅', title: 'Early Bird', description: 'Complete a task before 9 AM', unlocked: false },
        { id: 'system_master', icon: '🎓', title: 'System Master', description: 'Create 5 systems', unlocked: false },
    ],

    async init() {
        const stored = await getAllFromIndexedDB('achievements');
        if (stored.length > 0) {
            this.badges = stored;
        } else {
            // Save initial badges
            for (const badge of this.badges) {
                await saveToIndexedDB('achievements', badge);
            }
        }
    },

    async unlock(badgeId) {
        const badge = this.badges.find(b => b.id === badgeId);
        if (badge && !badge.unlocked) {
            badge.unlocked = true;
            await saveToIndexedDB('achievements', badge);
            showToast(`🎉 Achievement Unlocked: ${badge.title}!`);
            AppState.points += 100;
            await AppState.savePoints();
            return true;
        }
        return false;
    },

    async checkAchievements(state) {
        // First system
        if (state.systems.length >= 1) {
            await this.unlock('first_system');
        }

        // Streak achievements
        if (state.streak >= 3) {
            await this.unlock('streak_3');
        }
        if (state.streak >= 7) {
            await this.unlock('streak_7');
        }

        // Task completion achievements
        const totalCompleted = state.getTotalCompletedTasks();
        if (totalCompleted >= 10) {
            await this.unlock('complete_10');
        }
        if (totalCompleted >= 50) {
            await this.unlock('complete_50');
        }

        // Perfect day
        const todayCompleted = state.dailyTasks.filter(t => t.completed).length;
        const todayTotal = state.dailyTasks.length;
        if (todayTotal > 0 && todayCompleted === todayTotal) {
            await this.unlock('perfect_day');
        }

        // System master
        if (state.systems.length >= 5) {
            await this.unlock('system_master');
        }
    },

    render() {
        const container = document.getElementById('badgesList');
        if (!container) return;

        container.innerHTML = this.badges.map(badge => `
            <div class="badge ${badge.unlocked ? 'unlocked' : ''}" 
                 title="${badge.description}">
                <div class="badge__icon">${badge.icon}</div>
                <div class="badge__title">${badge.title}</div>
                <div class="badge__description">${badge.description}</div>
            </div>
        `).join('');
    }
};

// ========== App State Management ==========
const AppState = {
    systems: [],
    dailyTasks: [],
    streak: 0,
    lastActive: null,
    points: 0,
    totalTasksCompleted: 0,

    async init() {
        await initDB();
        await Achievements.init();
        await this.loadFromStorage();
        this.updateDailyTasks();
        this.updateStats();
        this.render();
        Achievements.render();
    },

    async loadFromStorage() {
        try {
            // Load from IndexedDB
            this.systems = await getAllFromIndexedDB('systems');

            const stateData = await getFromIndexedDB('appState', 'mainState');
            if (stateData) {
                this.streak = stateData.streak || 0;
                this.lastActive = stateData.lastActive || null;
                this.points = stateData.points || 0;
                this.totalTasksCompleted = stateData.totalTasksCompleted || 0;
            }
        } catch (e) {
            console.error('Error loading data from IndexedDB:', e);
        }
    },

    async saveToStorage() {
        try {
            // Save systems
            for (const system of this.systems) {
                await saveToIndexedDB('systems', system);
            }

            // Save app state
            await saveToIndexedDB('appState', {
                key: 'mainState',
                streak: this.streak,
                lastActive: this.lastActive,
                points: this.points,
                totalTasksCompleted: this.totalTasksCompleted
            });
        } catch (e) {
            console.error('Error saving data to IndexedDB:', e);
        }
    },

    async savePoints() {
        await saveToIndexedDB('appState', {
            key: 'mainState',
            streak: this.streak,
            lastActive: this.lastActive,
            points: this.points,
            totalTasksCompleted: this.totalTasksCompleted
        });
        this.updatePointsDisplay();
    },

    updatePointsDisplay() {
        const pointsEl = document.getElementById('userPoints');
        if (pointsEl) {
            pointsEl.textContent = this.points;
        }
    },

    async addSystem(system) {
        system.id = Date.now().toString();
        system.createdAt = new Date().toISOString();
        system.tasks = system.tasks.map((task, idx) => ({
            id: `${system.id}-${idx}`,
            title: task,
            completed: false,
            completedAt: null
        }));

        this.systems.push(system);
        this.points += 50; // Reward for creating a system

        await this.saveToStorage();
        await this.savePoints();
        this.updateDailyTasks();
        this.updateStats();
        this.render();

        await Achievements.checkAchievements(this);
        Achievements.render();
    },

    async deleteSystem(systemId) {
        this.systems = this.systems.filter(s => s.id !== systemId);
        await deleteFromIndexedDB('systems', systemId);
        await this.saveToStorage();
        this.updateDailyTasks();
        this.updateStats();
        this.render();
    },

    async toggleTask(taskId) {
        let taskJustCompleted = false;

        this.dailyTasks = this.dailyTasks.map(task => {
            if (task.id === taskId) {
                const newCompleted = !task.completed;
                if (newCompleted && !task.completed) {
                    taskJustCompleted = true;
                    this.totalTasksCompleted++;
                    this.points += 10; // Reward for completing a task
                }
                return {
                    ...task,
                    completed: newCompleted,
                    completedAt: newCompleted ? new Date().toISOString() : null
                };
            }
            return task;
        });

        // Update in systems
        this.systems = this.systems.map(system => ({
            ...system,
            tasks: system.tasks.map(task => {
                if (task.id === taskId) {
                    const newCompleted = !task.completed;
                    return {
                        ...task,
                        completed: newCompleted,
                        completedAt: newCompleted ? new Date().toISOString() : null
                    };
                }
                return task;
            })
        }));

        this.updateStreak();
        await this.saveToStorage();
        await this.savePoints();
        this.updateStats();
        this.renderDaily();

        if (taskJustCompleted) {
            await Achievements.checkAchievements(this);
            Achievements.render();
        }
    },

    updateDailyTasks() {
        this.dailyTasks = [];
        this.systems.forEach(system => {
            if (system.frequency === 'daily') {
                this.dailyTasks.push(...system.tasks);
            }
        });
    },

    async updateStreak() {
        const today = new Date().toDateString();
        const completedToday = this.dailyTasks.filter(t => t.completed).length;
        const totalToday = this.dailyTasks.length;

        if (totalToday > 0 && completedToday === totalToday) {
            if (this.lastActive !== today) {
                this.streak += 1;
                this.lastActive = today;
                this.points += 25; // Bonus points for maintaining streak
                await this.savePoints();
                showToast('🔥 Streak extended! Keep it up!');
                await Achievements.checkAchievements(this);
                Achievements.render();
            }
        }
    },

    getTotalCompletedTasks() {
        return this.totalTasksCompleted;
    },

    updateStats() {
        // Update overview stats
        document.getElementById('totalSystems').textContent = this.systems.length;
        document.getElementById('todayTasks').textContent = this.dailyTasks.length;

        const completed = this.dailyTasks.filter(t => t.completed).length;
        const total = this.dailyTasks.length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        document.getElementById('completionRate').textContent = rate + '%';
        document.getElementById('streakDays').textContent = this.streak;

        // Update analytics
        document.getElementById('totalCompleted').textContent = this.getTotalCompletedTasks();
        document.getElementById('avgCompletionRate').textContent = rate + '%';

        // Update daily progress
        const progressBar = document.getElementById('dailyProgress');
        if (progressBar) {
            progressBar.style.width = rate + '%';
            progressBar.setAttribute('aria-valuenow', rate);
            progressBar.textContent = rate + '%';
        }

        // Update streak visualization
        for (let i = 0; i < 7; i++) {
            const el = document.getElementById(`streak${i}`);
            if (el) {
                if (i < this.streak) {
                    el.classList.add('active');
                    el.textContent = '✓';
                } else {
                    el.classList.remove('active');
                    el.textContent = '·';
                }
            }
        }

        // Update points
        this.updatePointsDisplay();
    },

    render() {
        this.renderSystems();
        this.renderDaily();
    },

    renderSystems() {
        const container = document.getElementById('systemsList');
        const emptyState = document.getElementById('systemsEmptyState');

        if (this.systems.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = this.systems.map(system => `
            <div class="card">
                <div class="card__header">
                    <h3 class="card__title">⚙️ ${this.sanitize(system.title)}</h3>
                    <span class="card__badge">${system.frequency}</span>
                </div>
                <p style="color: var(--color-text-secondary); margin-bottom: 16px;">${this.sanitize(system.goal)}</p>
                <div style="margin-bottom: 16px;">
                    <strong>Tasks:</strong>
                    <ul style="margin-left: 20px; margin-top: 8px;">
                        ${system.tasks.map(task => `
                            <li style="margin-bottom: 4px;">${this.sanitize(task.title)}</li>
                        `).join('')}
                    </ul>
                </div>
                <button class="btn btn--pink" data-action="delete-system" data-system-id="${system.id}">
                    🗑️ Delete System
                </button>
            </div>
        `).join('');
    },

    renderDaily() {
        const container = document.getElementById('dailyTasksList');
        const emptyState = document.getElementById('dailyEmptyState');

        if (this.dailyTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = `
            <ul class="task-list">
                ${this.dailyTasks.map(task => `
                    <li class="task-item ${task.completed ? 'completed' : ''}">
                        <input type="checkbox" class="task-checkbox" 
                            data-task-id="${task.id}" 
                            ${task.completed ? 'checked' : ''}
                            aria-label="Mark ${this.sanitize(task.title)} as ${task.completed ? 'incomplete' : 'complete'}">
                        <span class="task-content">${this.sanitize(task.title)}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    },

    sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Export data as JSON
    async exportData() {
        const data = {
            systems: this.systems,
            state: {
                streak: this.streak,
                lastActive: this.lastActive,
                points: this.points,
                totalTasksCompleted: this.totalTasksCompleted
            },
            achievements: Achievements.badges,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `systems-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('📥 Data exported successfully!');
    },

    // Import data from JSON
    async importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);

            // Import systems
            if (data.systems) {
                this.systems = data.systems;
                for (const system of this.systems) {
                    await saveToIndexedDB('systems', system);
                }
            }

            // Import state
            if (data.state) {
                this.streak = data.state.streak || 0;
                this.lastActive = data.state.lastActive || null;
                this.points = data.state.points || 0;
                this.totalTasksCompleted = data.state.totalTasksCompleted || 0;
                await this.saveToStorage();
            }

            // Import achievements
            if (data.achievements) {
                Achievements.badges = data.achievements;
                for (const badge of Achievements.badges) {
                    await saveToIndexedDB('achievements', badge);
                }
            }

            this.updateDailyTasks();
            this.updateStats();
            this.render();
            Achievements.render();
            showToast('📤 Data imported successfully!');
        } catch (e) {
            console.error('Error importing data:', e);
            showToast('❌ Error importing data. Please check the file format.');
        }
    }
};

// ========== UI Functions ==========
function switchTab(tabName) {
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${tabName}-section`).classList.add('active');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    // Focus first input
    const firstInput = modal.querySelector('input, textarea, button');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const icon = document.getElementById('themeIcon');
    icon.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';

    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

// ========== PWA Service Worker Registration ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                console.log('✅ Service Worker registered successfully:', registration.scope);

                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute
            })
            .catch((error) => {
                console.error('❌ Service Worker registration failed:', error);
            });
    });
}

// ========== PWA Install Prompt ==========
let deferredPrompt;
const installButton = document.createElement('button');
installButton.className = 'btn btn--success';
installButton.innerHTML = '📱 Install App';
installButton.style.display = 'none';
installButton.style.position = 'fixed';
installButton.style.bottom = '80px';
installButton.style.right = '24px';
installButton.style.zIndex = '1000';
installButton.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';

document.body.appendChild(installButton);

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Save the event for later use
    deferredPrompt = e;
    // Show the install button
    installButton.style.display = 'block';

    console.log('💡 PWA install prompt available');
});

installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
        return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
        console.log('✅ User accepted the install prompt');
        showToast('🎉 App installed successfully!');
    } else {
        console.log('❌ User dismissed the install prompt');
    }

    // Clear the deferred prompt
    deferredPrompt = null;
    installButton.style.display = 'none';
});

// Listen for successful installation
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA was installed successfully');
    showToast('🎉 App installed! You can now use it offline.');
    installButton.style.display = 'none';
    deferredPrompt = null;
});

// ========== Online/Offline Status ==========
window.addEventListener('online', () => {
    showToast('🌐 You are back online!');
});

window.addEventListener('offline', () => {
    showToast('📡 You are offline. Your data is still saved locally.');
});

// ========== Event Listeners ==========
document.addEventListener('DOMContentLoaded', () => {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeIcon').textContent = '☀️';
    }

    // Initialize app
    AppState.init();

    // Event delegation for buttons
    document.addEventListener('click', (e) => {
        const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

        if (!action) return;

        switch (action) {
            case 'theme':
                toggleTheme();
                break;
            case 'guide':
                openModal('guideModal');
                break;
            case 'new-system':
                openModal('newSystemModal');
                break;
            case 'close-modal':
                closeModal(e.target.closest('.modal').id);
                break;
            case 'delete-system':
                if (confirm('Are you sure you want to delete this system?')) {
                    const systemId = e.target.dataset.systemId;
                    AppState.deleteSystem(systemId);
                    showToast('System deleted successfully');
                }
                break;
            case 'export-data':
                AppState.exportData();
                break;
            case 'import-data':
                document.getElementById('importFileInput').click();
                break;
        }
    });

    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Form submission
    document.getElementById('newSystemForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const title = document.getElementById('systemTitle').value;
        const goal = document.getElementById('systemGoal').value;
        const frequency = document.getElementById('systemFrequency').value;
        const tasksText = document.getElementById('systemTasks').value;
        const tasks = tasksText.split('\n').filter(t => t.trim());

        if (tasks.length === 0) {
            showToast('Please add at least one task');
            return;
        }

        AppState.addSystem({
            title,
            goal,
            frequency,
            tasks
        });

        closeModal('newSystemModal');
        showToast('System created successfully! 🎉 +50 points!');
        switchTab('systems');

        // Reset form
        e.target.reset();
    });

    // Task checkbox delegation
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('task-checkbox')) {
            const taskId = e.target.dataset.taskId;
            AppState.toggleTask(taskId);

            if (e.target.checked) {
                showToast('Great job! Keep going! 💪 +10 points!');
            }
        }
    });

    // File import handler
    document.getElementById('importFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                AppState.importData(event.target.result);
            };
            reader.readAsText(file);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                closeModal(modal.id);
            });
        }
    });

    // Modal click outside to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
});
