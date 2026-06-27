import { ALL_PROMPTS_OPTION, type Prompt, promptLibraryItems } from "@/lib/prompt-library";

export type PromptQuery = {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
};

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

type PromptFilters = {
    keyword: string;
    selectedTags: string[];
    category: string;
};

function getPromptSearchText(item: Prompt): string {
    return `${item.title}\n${item.prompt}\n${item.preview}\n${item.tags.join("\n")}`.toLowerCase();
}

function normalizeSelectedTags(tags: string[]): string[] {
    return tags.map((item) => item.trim()).filter(Boolean);
}

function getPromptTags(): string[] {
    return Array.from(new Set(promptLibraryItems.flatMap((item) => item.tags)));
}

function getPromptCategories(): string[] {
    return Array.from(new Set(promptLibraryItems.map((item) => item.category)));
}

function matchesPrompt(item: Prompt, { keyword, selectedTags, category }: PromptFilters): boolean {
    if (category !== ALL_PROMPTS_OPTION && item.category !== category) {
        return false;
    }

    if (selectedTags.length > 0 && !selectedTags.every((selectedTag) => item.tags.includes(selectedTag))) {
        return false;
    }

    if (!keyword) {
        return true;
    }

    return getPromptSearchText(item).includes(keyword);
}

function paginatePrompts(items: Prompt[], page?: number, pageSize?: number): Prompt[] {
    const currentPage = Math.max(page || 1, 1);
    const currentPageSize = Math.max(pageSize || items.length || 1, 1);
    const start = (currentPage - 1) * currentPageSize;

    return items.slice(start, start + currentPageSize);
}

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page, pageSize }: PromptQuery = {}): Promise<PromptListResponse> {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const selectedTags = normalizeSelectedTags(tag);
    const filteredItems = promptLibraryItems.filter((item) => matchesPrompt(item, { keyword: normalizedKeyword, selectedTags, category }));

    return {
        items: paginatePrompts(filteredItems, page, pageSize),
        tags: getPromptTags(),
        categories: getPromptCategories(),
        total: filteredItems.length,
    };
}
