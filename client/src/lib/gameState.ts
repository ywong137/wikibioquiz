// Global game state to prevent concurrent requests
let activePersonRequest: Promise<any> | null = null;
let currentSessionId: number | null = null;
let currentRound: number = 1;

export function setGameSession(sessionId: number) {
  currentSessionId = sessionId;
  currentRound = 1;
}

export function setCurrentRound(round: number) {
  currentRound = round;
}

export async function fetchPersonSafely(sessionId: number, round: number): Promise<any> {
  // If there's already an active request for this session/round, return it
  if (activePersonRequest && currentSessionId === sessionId && currentRound === round) {
    console.log(`🔒 Frontend: Reusing existing person request for session ${sessionId}, round ${round}`);
    return activePersonRequest;
  }

  // Start a new request
  console.log(`🎯 Frontend: Starting new person request for session ${sessionId}, round ${round}`);
  currentSessionId = sessionId;
  currentRound = round;
  
  activePersonRequest = fetch(`/api/game/person?sessionId=${sessionId}`)
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch person from Wikipedia');
      }
      return response.json();
    })
    .finally(() => {
      // Clear the active request when done
      activePersonRequest = null;
    });

  return activePersonRequest;
}

export function clearActiveRequest() {
  activePersonRequest = null;
}