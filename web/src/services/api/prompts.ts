import { ALL_PROMPTS_OPTION, type Prompt, promptLibraryItems } from "@/lib/prompt-library";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page, pageSize }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const selectedTags = tag.map((item) => item.trim()).filter(Boolean);
    const filteredItems = promptLibraryItems.filter((item) => {
        if (category !== ALL_PROMPTS_OPTION && item.category !== category) return false;
        if (selectedTags.length > 0 && !selectedTags.every((selectedTag) => item.tags.includes(selectedTag))) return false;
        if (!normalizedKeyword) return true;
        const haystack = `${item.title}\n${item.prompt}\n${item.preview}\n${item.tags.join("\n")}`.toLowerCase();
        return haystack.includes(normalizedKeyword);
    });
    const currentPage = Math.max(page || 1, 1);
    const currentPageSize = Math.max(pageSize || filteredItems.length || 1, 1);
    const start = (currentPage - 1) * currentPageSize;

    return {
        items: filteredItems.slice(start, start + currentPageSize),
        tags: Array.from(new Set(promptLibraryItems.flatMap((item) => item.tags))),
        categories: Array.from(new Set(promptLibraryItems.map((item) => item.category))),
        total: filteredItems.length,
    };
}
