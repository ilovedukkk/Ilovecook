const KEYS = {
    INGREDIENTS: 'fc_ingredients',
    FAVORITES: 'fc_favorites',
    SHOPPING: 'fc_shopping'
};

export const Storage = {
    get(key) {
        return JSON.parse(localStorage.getItem(key)) || [];
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    toggle(key, item) {
        let list = this.get(key);
        if (list.includes(item)) {
            list = list.filter(i => i !== item);
        } else {
            list.push(item);
        }
        this.set(key, list);
        return list;
    },
    KEYS
};
