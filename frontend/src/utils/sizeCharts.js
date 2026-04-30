/**
 * Size charts data + category mapping.
 *
 * Adding a new chart is two steps:
 *   1. Add an entry to `sizeCharts` (title, unit, columns, rows).
 *   2. Map any number of categories to its key in `CATEGORY_TO_CHART`.
 */

export const sizeCharts = {
    women: {
        title: "Women's Size Chart",
        unit: 'inches',
        columns: ['Size', 'Chest', 'Hips'],
        rows: [
            ['M', '38', '40'],
            ['L', '40', '42'],
            ['XL', '42', '44'],
            ['XXL', '44', '46'],
            ['3XL', '46', '48'],
        ],
    },

    menKurta: {
        title: "Men's Kurta Size Chart",
        unit: 'inches',
        columns: ['Size', 'Chest', 'Kurta Chest', 'Kurta Neck', 'Waist', 'Jacket Chest'],
        rows: [
            ['S',   '36', '39-40', '15',   '38', '38'],
            ['M',   '38', '41-42', '15.5', '40', '40'],
            ['L',   '40', '43-44', '16',   '42', '42'],
            ['XL',  '42', '45-46', '16.5', '44', '44'],
            ['2XL', '44', '47-48', '17.5', '46', '46'],
            ['3XL', '46', '49-50', '18',   '48', '48'],
            ['4XL', '48', '51-52', '18.5', '50', '50'],
            ['5XL', '50', '53-54', '19',   '52', '52'],
        ],
    },

    kids: {
        title: 'Kids Size Chart',
        // Mixed units (Indian sizes, inches) — kept off the heading and
        // left to the cell values themselves.
        columns: ['Age', 'Indian Size', 'Blouse Chest', 'Blouse Length', 'Skirt Length'],
        rows: [
            ['3-6m',     '10', '17',   'According to size', '12'],
            ['6-9m',     '12', '17.5', 'According to size', '13'],
            ['9-12m',    '14', '18',   'According to size', '15'],
            ['12-18m',   '16', '20',   'According to size', '18'],
            ['18-24m',   '18', '22',   '9',  '22'],
            ['2-3 yrs',  '20', '23',   '10', '23'],
            ['3-4 yrs',  '22', '24',   '11', '26'],
            ['4-5 yrs',  '24', '25',   '12', '28'],
            ['5-6 yrs',  '26', '26',   '13', '30'],
            ['7-8 yrs',  '28', '27',   '14', '32'],
            ['8-9 yrs',  '30', '28',   '15', '34'],
            ['9-10 yrs', '32', '30',   '16', '36'],
            ['11-12 yrs','34', '32',   '17', '38'],
            ['13-14 yrs','36', '34',   '18', '40'],
            ['15-16 yrs','38', '38',   '19', '42'],
        ],
    },
};

/**
 * Category → chart key. Categories absent from this map (e.g. Dupattas,
 * Pashminas) have no chart and the UI skips the button entirely.
 */
const CATEGORY_TO_CHART = {
    // Women's apparel
    'Anarkalis':       'women',
    'Coord Sets':      'women',
    'Lehangas':        'women',
    'Indo Western':    'women',
    'Suits & Kurtis':  'women',
    'Sarees':          'women',
    'Blouses':         'women',

    // Men's apparel
    "Men's Kurta":     'menKurta',

    // Kids
    'Kidswear':        'kids',
};

/**
 * Returns the chart key for a category (or null if none applies).
 * Lookup is case-insensitive so it tolerates upstream casing changes.
 */
export const getSizeChartKey = (category) => {
    if (!category) return null;
    if (CATEGORY_TO_CHART[category]) return CATEGORY_TO_CHART[category];
    const lower = category.toLowerCase();
    const match = Object.keys(CATEGORY_TO_CHART).find(
        (k) => k.toLowerCase() === lower
    );
    return match ? CATEGORY_TO_CHART[match] : null;
};

export const getSizeChart = (category) => {
    const key = getSizeChartKey(category);
    return key ? sizeCharts[key] : null;
};
