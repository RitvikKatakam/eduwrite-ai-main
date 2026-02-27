import os
from tavily import TavilyClient

class TavilySearchService:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            print("WARNING: TAVILY_API_KEY not found. Search functionality will be disabled.")
            self.client = None
        else:
            self.client = TavilyClient(api_key=self.api_key)

    def search(self, query, max_results=5):
        """
        Executes a search query using Tavily and returns top results.
        """
        if not self.client:
            return None
        
        try:
            print(f"DEBUG: Performing web search for: {query}")
            # Search context for better results
            search_result = self.client.search(query=query, search_depth="advanced", max_results=max_results)
            return search_result.get('results', [])
        except Exception as e:
            print(f"ERROR: Tavily search failed: {e}")
            return None

    def format_results_for_llm(self, results):
        """
        Formats search results into a clean string for LLM context.
        """
        if not results:
            return "No relevant search results found."
        
        formatted_text = "WEBSITE SEARCH RESULTS:\n\n"
        for i, res in enumerate(results, 1):
            title = res.get('title', 'No Title')
            content = res.get('content', 'No Content')
            url = res.get('url', 'No URL')
            formatted_text += f"{i}. [{title}]({url})\n   Content: {content}\n\n"
        
        formatted_text += "INSTRUCTION: Use the above search results to provide a factually accurate and up-to-date answer. If the search results do not contain the answer, state that you don't have enough current information."
        return formatted_text

# Singleton instance
search_service = TavilySearchService()
