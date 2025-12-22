export const Filters = {
    filterRecipes(recipes, criteria) {
        return recipes.filter(recipe => {
            if (recipe.time > criteria.maxTime) return false;
            if (criteria.vegOnly && !recipe.vegetarian) return false;
            if (criteria.budgetOnly && !recipe.budget) return false;
            return true;
        });
    },

    searchIngredients(ingredients, query) {
        if (!query) return ingredients;
        const q = query.toLowerCase();
        return ingredients.filter(ing => ing.name.toLowerCase().includes(q));
    }
};
