// src/state/store.js - Global state management
class Store {
    constructor() {
        this.state = {
            user: null,
            election: null,
            votes: [],
            isLoading: false
        };
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.notifyListeners();
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export default new Store();
