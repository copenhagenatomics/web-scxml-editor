/**
 * SCXML Condition Evaluator
 * Parses and evaluates SCXML transition conditions with proper HTML entity decoding
 * and support for complex logical expressions
 */

export interface ConditionContext {
  [key: string]: any;
}

export interface ParsedCondition {
  raw: string;
  decoded: string;
  variables: string[];
  isComplex: boolean;
}

export class ConditionEvaluator {
  /**
   * Decode HTML entities commonly used in SCXML
   */
  static decodeHtmlEntities(condition: string): string {
    if (!condition) return '';

    return condition
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;&amp;/g, '&&')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#39;/g, "'");
  }

  /**
   * Extract variable names from a condition
   */
  static extractVariables(condition: string): string[] {
    const decoded = this.decodeHtmlEntities(condition);
    const variables = new Set<string>();

    // Match variable names (alphanumeric + underscore, not starting with number)
    // Exclude keywords and operators
    const variablePattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const keywords = new Set([
      'true', 'false', 'null', 'undefined',
      'if', 'else', 'return', 'function',
      'var', 'let', 'const', 'new',
      'typeof', 'instanceof', 'in'
    ]);

    let match;
    while ((match = variablePattern.exec(decoded)) !== null) {
      const varName = match[1];
      // Filter out keywords and numeric literals
      if (!keywords.has(varName) && isNaN(Number(varName))) {
        variables.add(varName);
      }
    }

    return Array.from(variables);
  }

  /**
   * Parse a condition into a structured format
   */
  static parseCondition(condition: string): ParsedCondition {
    if (!condition) {
      return {
        raw: '',
        decoded: '',
        variables: [],
        isComplex: false
      };
    }

    const decoded = this.decodeHtmlEntities(condition);
    const variables = this.extractVariables(condition);

    // Check if condition contains logical operators
    const isComplex =
      decoded.includes('&&') ||
      decoded.includes('||') ||
      decoded.includes('!') ||
      (decoded.match(/[<>]=?/g) || []).length > 1;

    return {
      raw: condition,
      decoded,
      variables,
      isComplex
    };
  }

  /**
   * Evaluate a condition given a context
   * Returns true, false, or null if evaluation fails
   */
  static evaluateCondition(
    condition: string,
    context: ConditionContext
  ): boolean | null {
    if (!condition) return true; // No condition means always true

    try {
      const decoded = this.decodeHtmlEntities(condition);

      // Create a safe evaluation function
      // This uses Function constructor for better security than eval
      const contextKeys = Object.keys(context);
      const contextValues = contextKeys.map(key => context[key]);

      // Build the function with the context variables as parameters
      const func = new Function(...contextKeys, `return ${decoded}`);

      // Execute with context values
      const result = func(...contextValues);

      return Boolean(result);
    } catch (error) {
      console.warn('Failed to evaluate condition:', condition, error);
      return null; // Return null if evaluation fails
    }
  }

  /**
   * Format a condition for display
   */
  static formatCondition(condition: string): string {
    const decoded = this.decodeHtmlEntities(condition);

    // Add spacing around operators for readability
    return decoded
      .replace(/&&/g, ' && ')
      .replace(/\|\|/g, ' || ')
      .replace(/([<>]=?)/g, ' $1 ')
      .replace(/([=!]=)/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get a human-readable summary of the condition
   */
  static getConditionSummary(condition: string): string {
    const parsed = this.parseCondition(condition);

    if (!parsed.decoded) return 'Always';

    if (parsed.isComplex) {
      return `Complex: ${parsed.variables.length} variable${parsed.variables.length !== 1 ? 's' : ''}`;
    }

    // For simple conditions, return a shortened version
    const formatted = this.formatCondition(condition);
    if (formatted.length > 30) {
      return formatted.substring(0, 27) + '...';
    }

    return formatted;
  }

  /**
   * Check if a condition uses a specific variable
   */
  static usesVariable(condition: string, variableName: string): boolean {
    const variables = this.extractVariables(condition);
    return variables.includes(variableName);
  }

  /**
   * Create a test context with default values for variables
   */
  static createTestContext(conditions: string[]): ConditionContext {
    const context: ConditionContext = {};
    const allVariables = new Set<string>();

    // Collect all variables from all conditions
    conditions.forEach(condition => {
      const variables = this.extractVariables(condition);
      variables.forEach(v => allVariables.add(v));
    });

    // Set default values based on common patterns
    allVariables.forEach(variable => {
      // Check for common patterns
      if (variable.includes('Pressure') || variable.includes('_bar')) {
        context[variable] = 0.0; // Pressure values
      } else if (variable.includes('_onoff') || variable.includes('Present')) {
        context[variable] = false; // Boolean switches
      } else if (variable.includes('Time') || variable.includes('timeout')) {
        context[variable] = 0; // Time values
      } else if (variable.includes('conf_')) {
        context[variable] = 1.0; // Configuration values
      } else if (variable.includes('alert') || variable.includes('error')) {
        context[variable] = false; // Alert/error flags
      } else {
        context[variable] = 0; // Default numeric
      }
    });

    return context;
  }
}

// Export helper functions for convenience
export const {
  decodeHtmlEntities,
  extractVariables,
  parseCondition,
  evaluateCondition,
  formatCondition,
  getConditionSummary,
  usesVariable,
  createTestContext
} = ConditionEvaluator;