import { writeFileSync, readFileSync, existsSync } from 'fs';

interface WikipediaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  scope?: string;
}

class WikipediaOAuth {
  private clientId: string;
  private clientSecret: string;
  private tokenFile = './wikipedia-token.json';
  private currentToken: WikipediaToken | null = null;

  constructor() {
    this.clientId = process.env.WIKIPEDIA_CLIENT_ID || '';
    this.clientSecret = process.env.WIKIPEDIA_CLIENT_SECRET || '';
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Wikipedia client ID and secret are required');
    }
    
    this.loadToken();
  }

  private loadToken(): void {
    if (existsSync(this.tokenFile)) {
      try {
        const tokenData = JSON.parse(readFileSync(this.tokenFile, 'utf8'));
        if (tokenData.expires_at > Date.now()) {
          this.currentToken = tokenData;
          console.log('✅ Loaded valid Wikipedia OAuth token');
        } else {
          console.log('⚠️ Wikipedia token expired, will refresh');
        }
      } catch (error) {
        console.log('❌ Error loading token file:', error);
      }
    }
  }

  private saveToken(token: WikipediaToken): void {
    writeFileSync(this.tokenFile, JSON.stringify(token, null, 2));
    this.currentToken = token;
    console.log('✅ Saved Wikipedia OAuth token');
  }

  async getAccessToken(): Promise<string> {
    if (this.currentToken && this.currentToken.expires_at > Date.now()) {
      return this.currentToken.access_token;
    }

    console.log('🔄 Obtaining new Wikipedia OAuth token...');
    
    // Use client credentials flow for Wikipedia OAuth
    const tokenUrl = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token';
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'WikipediaGuessingGame/1.0 (https://replit.com)'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Wikipedia OAuth failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenData = await response.json();
    
    const token: WikipediaToken = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
      scope: tokenData.scope
    };

    this.saveToken(token);
    return token.access_token;
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'WikipediaGuessingGame/1.0 (https://replit.com)',
      'Accept': 'application/json',
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  async fetchWikipediaSections(title: string): Promise<string[]> {
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(title)}&prop=sections&formatversion=2`;
    
    const response = await this.makeAuthenticatedRequest(sectionsUrl);
    
    if (!response.ok) {
      throw new Error(`Wikipedia sections fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Wikipedia API error: ${data.error.info}`);
    }

    if (!data.parse?.sections) {
      return [];
    }

    return data.parse.sections
      .map((section: any) => section.line || section.anchor || 'Unknown')
      .filter((title: string) => title && title !== 'Unknown');
  }

  async fetchWikipediaBiography(title: string): Promise<string> {
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&formatversion=2`;
    
    const response = await this.makeAuthenticatedRequest(extractUrl);
    
    if (!response.ok) {
      throw new Error(`Wikipedia biography fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Wikipedia API error: ${data.error.info}`);
    }

    const pages = data.query?.pages || [];
    if (pages.length === 0 || !pages[0].extract) {
      throw new Error('No Wikipedia biography found');
    }

    return pages[0].extract;
  }
}

export const wikipediaOAuth = new WikipediaOAuth();

// Test function
async function testWikipediaOAuth() {
  console.log('Testing Wikipedia OAuth authentication...');
  
  try {
    // Test token acquisition
    const token = await wikipediaOAuth.getAccessToken();
    console.log('✅ Successfully obtained access token:', token.substring(0, 10) + '...');
    
    // Test sections fetch
    const sections = await wikipediaOAuth.fetchWikipediaSections('Albert Einstein');
    console.log('✅ Successfully fetched sections for Albert Einstein:', sections.length, 'sections');
    console.log('First 5 sections:', sections.slice(0, 5));
    
    // Test biography fetch
    const biography = await wikipediaOAuth.fetchWikipediaBiography('Albert Einstein');
    console.log('✅ Successfully fetched biography for Albert Einstein:', biography.substring(0, 100) + '...');
    
    console.log('🎉 Wikipedia OAuth authentication working correctly!');
    
  } catch (error) {
    console.error('❌ Wikipedia OAuth test failed:', error);
  }
}

// Export for use in other modules
export { testWikipediaOAuth };