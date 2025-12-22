export const Filters = {
    filterRecipes(recipes, criteria) {
        return recipes.filter(recipe => {
            // Фильтр по времени
            if (recipe.time > criteria.maxTime) return false;
            
            // Фильтр вегетарианский
            if (criteria.vegOnly && !recipe.vegetarian) return false;
            
            // Фильтр бюджета
            if (criteria.budgetOnly && !recipe.budget) return false;

            return true;
        });
    },

    // Функция поиска по названию продукта
    searchIngredients(ingredients, query) {
        if (!query) return ingredients;
        const q = query.toLowerCase();
        return ingredients.filter(ing => ing.name.toLowerCase().includes(q));
    }
};
