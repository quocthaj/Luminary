export function isValidAcademicEnglish(text: string): boolean {
    if (!text || text.length < 50) return false;
    
    const sample = text.substring(0, 15000).toLowerCase();
    
    const englishKeywords = [' the ', ' and ', ' is ', ' in ', ' to ', ' of ', ' for ', ' with ', ' on ', ' as ', ' by ', ' an ', ' this '];
    const academicKeywords = ['abstract', 'introduction', 'conclusion', 'references', 'method', 'result', 'discussion', 'figure', 'table', 'et al', 'doi', 'background', 'analysis', 'journal', 'literature'];
    
    let engCount = 0;
    for (const word of englishKeywords) {
        if (sample.includes(word)) engCount++;
    }
    
    let acadCount = 0;
    for (const word of academicKeywords) {
        if (sample.includes(word)) acadCount++;
    }
    
    // Allow only if it has enough English common words (likely an English text) 
    // AND it has strong academic keywords.
    return engCount >= 4 && acadCount >= 3;
}
