import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Brain, List, User, Lightbulb, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { GameSession, WikipediaPerson, Mode } from '@shared/schema';

interface GuessResponse {
  correct: boolean;
  pointsEarned: number;
  session: GameSession;
}

function getModeDisplayName(mode: Mode): string {
  switch (mode) {
    case 'everything':
      return 'Everything - HARD MODE';
    case 'modern':
      return 'Modern Only - INTERMEDIATE MODE';
    case 'american':
      return 'Americans - EASY MODE';
    default:
      return 'Everything - HARD MODE';
  }
}

export default function Game() {
  // Parse URL parameters for mode
  const urlParams = new URLSearchParams(window.location.search);
  const urlMode = urlParams.get('mode') as Mode | null;
  
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentPerson, setCurrentPerson] = useState<WikipediaPerson | null>(null);
  const [guess, setGuess] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [streakBonus, setStreakBonus] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  // Preload functionality disabled to prevent redundant fetching
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [hintUsed, setHintUsed] = useState(false);
  const [initialsUsed, setInitialsUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showInitials, setShowInitials] = useState(false);
  const [hintsClicked, setHintsClicked] = useState(0);
  const [currentPoints, setCurrentPoints] = useState(7);
  const [selectedMode, setSelectedMode] = useState<Mode>(
    urlMode && ['american', 'modern'].includes(urlMode) ? urlMode : 'everything'
  );
  const { toast } = useToast();

  // Create game session (with debugging)
  const createSessionMutation = useMutation({
    mutationFn: async (mode?: Mode) => {
      console.log(`🎮 Frontend: Creating new session with mode ${mode || selectedMode}...`);
      const response = await apiRequest('POST', '/api/game/session', {
        mode: mode || selectedMode
      });
      return response.json();
    },
    onSuccess: (session: GameSession) => {
      console.log(`🎮 Frontend: Session created successfully with ID ${session.id}`);
      setSessionId(session.id);
      setGameSession(session);
      queryClient.invalidateQueries({ queryKey: ['/api/game/session'] });
    },
  });

  // Switch mode mutation
  const switchModeMutation = useMutation({
    mutationFn: async (mode: Mode) => {
      console.log(`🎮 Frontend: Switching to mode ${mode}...`);
      const response = await apiRequest('POST', '/api/game/session/switch-mode', { mode });
      return response.json();
    },
    onSuccess: (session: GameSession) => {
      console.log(`🎮 Frontend: Mode switched successfully to ${session.mode}`);
      setSessionId(session.id);
      setGameSession(session);
      setSelectedMode(session.mode);
      // Reset game state
      setCurrentPerson(null);
      setGuess('');
      setShowFeedback(false);
      setHintUsed(false);
      setInitialsUsed(false);
      setShowHint(false);
      setShowInitials(false);
      setHintsClicked(0);
      setCurrentPoints(7);
      queryClient.invalidateQueries({ queryKey: ['/api/game/session'] });
      
      toast({
        title: "Mode Switched",
        description: `Now playing in ${getModeDisplayName(session.mode)} mode`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to switch mode. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Get current session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['/api/game/session', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      // Since we're using in-memory storage, we'll track the session client-side
      // In a real app, this would fetch from the server
      return null;
    },
  });

  // Fetch random person (with concurrency protection)
  const { data: person, isLoading: personLoading, error: personError } = useQuery({
    queryKey: ['/api/game/person', sessionId, roundNumber],
    enabled: !!sessionId && !createSessionMutation.isPending,
    staleTime: Infinity, // Don't refetch automatically
    retry: 1, // Reduce retries to minimize API calls
    queryFn: async () => {
      console.log(`🎯 Frontend: Requesting person for sessionId=${sessionId}, round=${roundNumber}`);
      const response = await fetch(`/api/game/person?sessionId=${sessionId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch person from Wikipedia');
      }
      return response.json();
    },
  });

  // Preload functionality removed to prevent redundant fetching

  // Update currentPerson when person data changes
  useEffect(() => {
    if (person) {
      setCurrentPerson(person);
      setShowFeedback(false);
      setGuess('');
      // Reset hint/scoring state for new person
      setHintsClicked(0);
      setCurrentPoints(7);
      setHintUsed(false);
      setInitialsUsed(false);
      setShowHint(false);
      setShowInitials(false);
    }
  }, [person]);

  // Preload functionality removed

  // Submit guess
  const submitGuessMutation = useMutation({
    mutationFn: async (guessData: { 
      guess: string; 
      sessionId: number; 
      personName: string;
      hintUsed: boolean;
      initialsUsed: boolean;
      hintsUsedCount: number;
    }) => {
      const response = await apiRequest('POST', '/api/game/guess', guessData);
      return response.json();
    },
    onSuccess: (data: GuessResponse & { streakBonus?: number }) => {
      setLastGuessCorrect(data.correct);
      setPointsEarned(data.pointsEarned);
      setStreakBonus(data.streakBonus || 0);
      setGameSession(data.session);
      setShowFeedback(true);
      
      // Invalidate session query to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/game/session'] });
      
      if (data.correct) {
        // Show special toast for milestone streak bonuses
        if (data.streakBonus && data.streakBonus % 5 === 0) {
          toast({
            title: "🎉 MILESTONE ACHIEVED! 🎉",
            description: `${data.streakBonus} correct in a row! Bonus: +${data.streakBonus} points`,
            duration: 4000,
          });
        } else {
          toast({
            title: "Correct! 🎉",
            description: `You earned ${data.pointsEarned} points!`,
          });
        }
      } else {
        toast({
          title: "Not quite! 😅",
          description: "Better luck next time!",
          variant: "destructive",
        });
      }
    },
  });

  // Get hint
  const getHintMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/game/hint', { 
        sessionId, 
        personName: currentPerson?.name 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGameSession(data.session);
      toast({
        title: "Hint (-5 points)",
        description: data.hint,
      });
    },
  });

  useEffect(() => {
    console.log(`🎮 Frontend: useEffect triggered - sessionId=${sessionId}, isPending=${createSessionMutation.isPending}`);
    if (!sessionId && !createSessionMutation.isPending) {
      console.log(`🎮 Frontend: Triggering session creation...`);
      createSessionMutation.mutate();
    } else {
      console.log(`🎮 Frontend: Skipping session creation (already exists or pending)`);
    }
  }, [sessionId, createSessionMutation.isPending]);

  const handleSubmitGuess = () => {
    if (!guess.trim() || !currentPerson || !sessionId) return;
    
    submitGuessMutation.mutate({
      guess: guess.trim(),
      sessionId,
      personName: currentPerson.name,
      hintUsed,
      initialsUsed,
      hintsUsedCount: hintsClicked,
    });
  };

  const handleNextPerson = async () => {
    if (!sessionId) return;
    
    try {
      // First, increment the round in the backend
      const response = await apiRequest('POST', `/api/game/session/${sessionId}/next-round`, {});
      const updatedSession = await response.json();
      
      // Update session data immediately
      setGameSession(updatedSession);
      
      // Invalidate session query to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/game/session'] });
      
      // Reset all state for new round
      setShowFeedback(false);
      setGuess('');
      setHintUsed(false);
      setInitialsUsed(false);
      setShowHint(false);
      setShowInitials(false);
      setHintsClicked(0);
      setCurrentPoints(7);
      
      // Increment round number to trigger new fetch
      setRoundNumber(prev => prev + 1);
    } catch (error) {
      console.error('Error incrementing round:', error);
      toast({
        title: "Error",
        description: "Failed to advance to next person",
        variant: "destructive"
      });
    }
  };

  const handleGetHint = () => {
    if (hintsClicked < 3 && currentPerson) {
      setHintsClicked(prev => prev + 1);
      setCurrentPoints(prev => prev - 1);
      setShowHint(true);
      
      if (hintsClicked === 0) {
        setHintUsed(true);
      }
    }
  };

  const handleGetInitials = () => {
    if (!initialsUsed && currentPerson) {
      setInitialsUsed(true);
      setShowInitials(true);
      setCurrentPoints(prev => prev - 2);
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showFeedback) {
      handleSubmitGuess();
    }
  };

  const calculateAccuracy = () => {
    if (!gameSession || gameSession.totalGuesses === 0) return 0;
    return Math.round((gameSession.correctGuesses / gameSession.totalGuesses) * 100);
  };

  if (sessionLoading || createSessionMutation.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        
        {/* Game Header */}
        <header className="text-center mb-8 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
              <Brain className="inline mr-3 text-indigo-600" size={48} />
              Super Fun Wiki Bio Quiz
            </h1>
            <p className="text-slate-600 text-lg font-medium">Can you guess the famous person from their biography sections?</p>
          </div>
          

        </header>

        {/* Game Instructions */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8 animate-slide-up">
          <div 
            className="flex items-center justify-between cursor-pointer" 
            onClick={() => setShowInstructions(!showInstructions)}
          >
            <h2 className="text-lg font-semibold text-indigo-800 flex items-center">
              <Lightbulb className="mr-2" size={20} />
              How to Play
            </h2>
            {showInstructions ? 
              <ChevronUp className="text-indigo-600" size={20} /> : 
              <ChevronDown className="text-indigo-600" size={20} />
            }
          </div>
          {showInstructions && (
            <div className="mt-4 text-indigo-700 space-y-2">
              <p className="flex items-start">
                <span className="w-2 h-2 bg-indigo-400 rounded-full mt-2 mr-3"></span>
                We'll show you section headings from a famous person's Wikipedia page
              </p>
              <p className="flex items-start">
                <span className="w-2 h-2 bg-indigo-400 rounded-full mt-2 mr-3"></span>
                Guess who it is based on the clues in the headings
              </p>
              <div className="bg-indigo-100 rounded-lg p-3 mt-3">
                <p className="font-semibold text-indigo-800 mb-2">📊 Scoring System:</p>
                <div className="text-sm space-y-1">
                  <p>• You get 7 points for every correct answer</p>
                  <p>• 3 hints are available - but a point is deducted for every hint you use!</p>
                  <p>• Show the person's initials - but 2 points are deducted!</p>
                  <p>• Streak milestone bonus for every 5 answers you get right!</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Score Display */}
        <div className="flex justify-center space-x-4 mb-8">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg text-center">
            <div className="text-sm font-medium opacity-90">Score</div>
            <div className="text-2xl font-bold">{gameSession?.score || 0}</div>
          </div>
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg text-center">
            <div className="text-sm font-medium opacity-90">Streak</div>
            <div className="text-2xl font-bold">{gameSession?.streak || 0}</div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl shadow-lg text-center">
            <div className="text-sm font-medium opacity-90">Round</div>
            <div className="text-2xl font-bold">{gameSession?.round || 1}</div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="mb-8">
          {/* Desktop layout: single line */}
          <div className="hidden md:flex justify-center items-center space-x-4">
            <span className="text-slate-600 font-medium">Too Hard? Try something easier:</span>
            <Select value={selectedMode} onValueChange={setSelectedMode}>
              <SelectTrigger className="w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everything">Everything - HARD MODE</SelectItem>
                <SelectItem value="modern">Modern Only - INTERMEDIATE MODE</SelectItem>
                <SelectItem value="american">Americans - EASY MODE</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={() => switchModeMutation.mutate(selectedMode)}
              disabled={switchModeMutation.isPending || selectedMode === gameSession?.mode}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2"
            >
              {switchModeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Switching...
                </>
              ) : (
                'Switch Mode'
              )}
            </Button>
          </div>
          
          {/* Mobile layout: two lines */}
          <div className="md:hidden text-center">
            <div className="text-slate-600 font-medium mb-3">Too Hard? Try something easier:</div>
            <div className="flex justify-center items-center space-x-3">
              <Select value={selectedMode} onValueChange={setSelectedMode}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everything">Everything - HARD MODE</SelectItem>
                  <SelectItem value="modern">Modern Only - INTERMEDIATE MODE</SelectItem>
                  <SelectItem value="american">Americans - EASY MODE</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={() => switchModeMutation.mutate(selectedMode)}
                disabled={switchModeMutation.isPending || selectedMode === gameSession?.mode}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2"
              >
                {switchModeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Switch
                  </>
                ) : (
                  'Switch Mode'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 animate-fade-in">
          
          {/* Loading State */}
          {personLoading && (
            <div className="text-center py-16">
              <Loader2 className="inline-block h-12 w-12 animate-spin text-indigo-600" />
              <p className="mt-4 text-slate-600 font-medium">Finding a famous person...</p>
            </div>
          )}

          {/* Error State */}
          {personError && !personLoading && (
            <div className="text-center py-16">
              <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md mx-auto">
                <div className="text-red-600 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Unable to Load Person
                </h3>
                <p className="text-red-700 text-sm mb-4">
                  {personError.message || 'Failed to fetch person from Wikipedia'}
                </p>
                <button 
                  onClick={() => setRoundNumber(prev => prev + 1)}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Game Content */}
          {currentPerson && !personLoading && !personError && (
            <div>
              {/* Person Hint */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">
                  <Lightbulb className="mr-2 text-yellow-500" size={16} />
                  <span>{currentPerson.hint}</span>
                </div>
              </div>

              {/* Section Headings Display */}
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-slate-800 mb-6 text-center flex items-center justify-center">
                  <List className="mr-2 text-indigo-600" size={24} />
                  Biography Section Headings
                </h3>
                
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {currentPerson.sections.map((section, index) => (
                    <div 
                      key={index}
                      className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-indigo-400 rounded-full mr-3"></div>
                        <span 
                          className="font-medium text-slate-700"
                          dangerouslySetInnerHTML={{ __html: section.replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>') }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!showFeedback && (
                <>
                  {/* Guess Input Area */}
                  <div className="bg-slate-50 rounded-xl p-6 mb-6">
                    <label htmlFor="guess-input" className="block text-lg font-semibold text-slate-800 mb-4 text-center">
                      <User className="inline mr-2 text-indigo-600" size={20} />
                      Who do you think this is?
                    </label>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <Input
                          id="guess-input"
                          type="text"
                          placeholder="Enter the person's name..."
                          value={guess}
                          onChange={(e) => setGuess(e.target.value)}
                          onKeyPress={handleKeyPress}
                          className="text-lg py-4 px-6 border-2 border-slate-200 focus:border-indigo-500"
                        />
                      </div>
                      <Button 
                        onClick={handleSubmitGuess}
                        disabled={!guess.trim() || submitGuessMutation.isPending}
                        className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                      >
                        {submitGuessMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <span className="mr-2">📨</span>
                            Submit Guess ({currentPoints} points)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Hint Buttons */}
                  <div className="flex justify-center space-x-4 mb-6">
                    <Button 
                      onClick={handleGetHint}
                      disabled={hintsClicked >= 3}
                      variant="outline"
                      className={`px-6 py-3 font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 ${
                        hintsClicked >= 3 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white border-0'
                      }`}
                    >
                      <Lightbulb className="mr-2" size={16} />
                      {hintsClicked >= 3 ? 'All Hints Used' : `Hint (${hintsClicked + 1}/3)`}
                    </Button>
                    <Button 
                      onClick={handleGetInitials}
                      disabled={initialsUsed}
                      variant="outline"
                      className={`px-6 py-3 font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 ${
                        initialsUsed 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0'
                      }`}
                    >
                      <User className="mr-2" size={16} />
                      {initialsUsed ? 'Initials Used' : 'Initials'}
                    </Button>
                  </div>

                  {/* Display Progressive Hints */}
                  {showHint && currentPerson && hintsClicked > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                      <div className="flex items-center text-yellow-800 mb-3">
                        <Lightbulb className="mr-2" size={16} />
                        <span className="font-semibold">AI Hints:</span>
                      </div>
                      <div className="space-y-2">
                        {hintsClicked >= 1 && currentPerson.aiHint1 && (
                          <div className="flex items-start">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                            <p className="text-yellow-700">{currentPerson.aiHint1}</p>
                          </div>
                        )}
                        {hintsClicked >= 2 && currentPerson.aiHint2 && (
                          <div className="flex items-start">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                            <p className="text-yellow-700">{currentPerson.aiHint2}</p>
                          </div>
                        )}
                        {hintsClicked >= 3 && currentPerson.aiHint3 && (
                          <div className="flex items-start">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                            <p className="text-yellow-700">{currentPerson.aiHint3}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {showInitials && currentPerson && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                      <div className="flex items-center text-blue-800 mb-2">
                        <User className="mr-2" size={16} />
                        <span className="font-semibold">Initials Hint:</span>
                      </div>
                      <p className="text-blue-700 text-2xl font-bold tracking-widest">{currentPerson.initials}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Feedback Area */}
        {showFeedback && currentPerson && (
          <div className="animate-bounce-gentle mb-8">
            {/* Correct Answer */}
            {lastGuessCorrect && (
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl p-8 mb-6 shadow-xl">
                <div className="text-center">
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-3xl font-bold mb-2">Correct!</h3>
                  <p className="text-xl opacity-90 mb-4">You guessed <span className="font-bold">{currentPerson.name}</span></p>
                  <div className="flex justify-center space-x-6 text-lg">
                    <div>Points: <span className="font-bold">+{pointsEarned}</span></div>
                    {streakBonus > 0 && (
                      <div className={`${streakBonus % 5 === 0 ? 'animate-pulse bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-lg shadow-lg' : ''}`}>
                        <span className="font-bold">
                          {streakBonus % 5 === 0 ? '🎉 MILESTONE BONUS' : 'Streak Bonus'}: +{streakBonus}
                          {streakBonus % 5 === 0 ? ' 🎉' : ''}
                        </span>
                      </div>
                    )}
                    <div>Current Streak: <span className="font-bold">{gameSession?.streak || 0}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Incorrect Answer */}
            {!lastGuessCorrect && (
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl p-8 mb-6 shadow-xl">
                <div className="text-center">
                  <div className="text-6xl mb-4">😅</div>
                  <h3 className="text-3xl font-bold mb-2">Not quite!</h3>
                  <p className="text-xl opacity-90 mb-4">The answer was <span className="font-bold">{currentPerson.name}</span></p>
                  <p className="text-lg opacity-80">Your streak has been reset. Keep trying!</p>
                </div>
              </div>
            )}

            {/* Next Round Button */}
            <div className="text-center">
              <Button 
                onClick={handleNextPerson}
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <span className="mr-2">➡️</span>
                Next Person
              </Button>
            </div>
          </div>
        )}

        {/* Game Stats */}
        <Card className="rounded-2xl shadow-lg mb-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-4 text-center flex items-center justify-center">
              <Trophy className="mr-2 text-indigo-600" size={24} />
              Session Stats
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-800">{gameSession?.totalGuesses || 0}</div>
                <div className="text-sm text-slate-600 font-medium">Total Guesses</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-emerald-600">{gameSession?.correctGuesses || 0}</div>
                <div className="text-sm text-slate-600 font-medium">Correct</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-indigo-600">{calculateAccuracy()}%</div>
                <div className="text-sm text-slate-600 font-medium">Accuracy</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-600">{gameSession?.bestStreak || 0}</div>
                <div className="text-sm text-slate-600 font-medium">Best Streak</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Footer */}
        <footer className="text-center text-slate-600 space-y-4">
          <p className="text-sm">
            <span className="block sm:inline">Powered by Wikipedia API and OpenAI</span>
            <span className="hidden sm:inline"> • </span>
            <span className="block sm:inline">Made with ❤️ for trivia lovers</span>
          </p>
          <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 max-w-md mx-auto">
            <p className="text-xs text-slate-500">
              Note: This was vibe-coded using AI so there are errors. The robot 🤖 is not that great and the human has a day job 🌳. Just have fun and try not to sweat the details. <a href="https://plant.terraformation.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-800 underline">Reforestation is the best solution to climate change!</a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
