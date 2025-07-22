import axios from 'axios';

export class AIService {
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor() {
    // In a real implementation, you'd want to configure this through VS Code settings
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = 'https://api.openai.com/v1';
  }

  async chat(message: string): Promise<string> {
    if (!this.apiKey) {
      return 'Please configure your OpenAI API key in the extension settings or environment variables.';
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI assistant for coding. Provide concise, practical answers.'
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return 'Sorry, I encountered an error while processing your request. Please check your API key and try again.';
    }
  }

  async explainCode(code: string): Promise<string> {
    const prompt = `Please explain what this code does:\\n\\n\`\`\`\\n${code}\\n\`\`\``;
    return this.chat(prompt);
  }

  async getCodeCompletion(prefix: string, language: string): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a code completion assistant. Complete the ${language} code based on the given prefix. Only return the completion text, no explanations.`
            },
            {
              role: 'user',
              content: `Complete this ${language} code:\\n${prefix}`
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error getting code completion:', error);
      return null;
    }
  }
}