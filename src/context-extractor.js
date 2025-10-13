export class ContextExtractor {
  constructor() {
    this.goalKeywords = ['goal', 'target', 'objective', 'aim', 'purpose', 'want to', 'need to', 'should'];
    this.requirementKeywords = ['requirement', 'must', 'should', 'need', 'require', 'constraint', 'condition'];
    this.constraintKeywords = ['constraint', 'limitation', 'restriction', 'cannot', 'avoid', 'exclude', 'without'];
  }

  extractGoalsAndRequirements(prompt) {
    const sentences = this.splitIntoSentences(prompt);
    
    return {
      goals: this.extractByKeywords(sentences, this.goalKeywords),
      requirements: this.extractByKeywords(sentences, this.requirementKeywords),
      constraints: this.extractByKeywords(sentences, this.constraintKeywords),
      extracted_at: new Date().toISOString()
    };
  }

  splitIntoSentences(text) {
    return text.split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  extractByKeywords(sentences, keywords) {
    const matches = [];
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      
      for (const keyword of keywords) {
        if (lowerSentence.includes(keyword)) {
          matches.push(sentence.trim());
          break; // Don't add the same sentence multiple times
        }
      }
    }
    
    return [...new Set(matches)]; // Remove duplicates
  }

  summarizeContext(goals, requirements, constraints, maxTokens = 500) {
    // Simple token estimation (rough approximation)
    const estimateTokens = (text) => Math.ceil(text.length / 4);
    
    let summary = {
      goals: goals.slice(0, 5), // Limit to top 5
      requirements: requirements.slice(0, 5),
      constraints: constraints.slice(0, 3)
    };
    
    // If still too long, truncate further
    const currentTokens = estimateTokens(JSON.stringify(summary));
    if (currentTokens > maxTokens) {
      summary = {
        goals: goals.slice(0, 3),
        requirements: requirements.slice(0, 3),
        constraints: constraints.slice(0, 2)
      };
    }
    
    return summary;
  }
}
