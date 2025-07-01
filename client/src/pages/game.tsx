import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Brain, List, User, Lightbulb, Trophy, RotateCcw, Share, ChevronDown, ChevronUp } from 'lucide-react';
import type { GameSession, WikipediaPerson } from '@shared/schema';

interface GuessResponse {
  correct: boolean;
  pointsEarned: number;
  session: GameSession;
}

export default function Game() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentPerson, setCurrentPerson] = useState<WikipediaPerson | null>(null);
  const [guess, setGuess] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const { toast } = useToast();

  // Create game session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/game/session');
      return response.json();
    },
    onSuccess: (session: GameSession) => {
      setSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ['/api/game/session'] });
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

  // Fetch random person
  const { data: person, isLoading: personLoading, refetch: fetchNewPerson } = useQuery({
    queryKey: ['/api/game/person', sessionId],
    enabled: !!sessionId,
    staleTime: Infinity, // Don't refetch automatically
    queryFn: async () => {
      const response = await fetch(`/api/game/person?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch person');
      return response.json();
    },
  });

  // Update currentPerson when person data changes
  useEffect(() => {
    if (person) {
      setCurrentPerson(person);
      setShowFeedback(false);
      setGuess('');
    }
  }, [person]);

  // Submit guess
  const submitGuessMutation = useMutation({
    mutationFn: async (guessData: { guess: string; sessionId: number; personName: string }) => {
      const response = await apiRequest('POST', '/api/game/guess', guessData);
      return response.json();
    },
    onSuccess: (data: GuessResponse) => {
      setLastGuessCorrect(data.correct);
      setPointsEarned(data.pointsEarned);
      setShowFeedback(true);
      
      if (data.correct) {
        toast({
          title: "Correct! 🎉",
          description: `You earned ${data.pointsEarned} points!`,
        });
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
      toast({
        title: "Hint (-5 points)",
        description: data.hint,
      });
    },
  });

  useEffect(() => {
    if (!sessionId) {
      createSessionMutation.mutate();
    }
  }, []);

  const handleSubmitGuess = () => {
    if (!guess.trim() || !currentPerson || !sessionId) return;
    
    submitGuessMutation.mutate({
      guess: guess.trim(),
      sessionId,
      personName: currentPerson.name,
    });
  };

  const handleNextPerson = () => {
    fetchNewPerson();
  };

  const handleGetHint = () => {
    if (!sessionId) return;
    getHintMutation.mutate();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showFeedback) {
      handleSubmitGuess();
    }
  };

  const calculateAccuracy = () => {
    const mockSession = {
      totalGuesses: 7,
      correctGuesses: 4,
    };
    return mockSession.totalGuesses > 0 
      ? Math.round((mockSession.correctGuesses / mockSession.totalGuesses) * 100) 
      : 0;
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
              WikiGuess
            </h1>
            <p className="text-slate-600 text-lg font-medium">Can you guess the famous person from their biography sections?</p>
          </div>
          
          {/* Score Display */}
          <div className="flex justify-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg">
              <div className="text-sm font-medium opacity-90">Score</div>
              <div className="text-2xl font-bold">0</div>
            </div>
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg">
              <div className="text-sm font-medium opacity-90">Streak</div>
              <div className="text-2xl font-bold">0</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl shadow-lg">
              <div className="text-sm font-medium opacity-90">Round</div>
              <div className="text-2xl font-bold">1</div>
            </div>
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
              <p className="flex items-start">
                <span className="w-2 h-2 bg-indigo-400 rounded-full mt-2 mr-3"></span>
                Get points for correct guesses and build your streak!
              </p>
            </div>
          )}
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

          {/* Game Content */}
          {currentPerson && !personLoading && (
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
                        <span className="font-medium text-slate-700">{section}</span>
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
                            Submit Guess
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Hint Button */}
                  <div className="text-center mb-6">
                    <Button 
                      onClick={handleGetHint}
                      disabled={getHintMutation.isPending}
                      variant="outline"
                      className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white border-0 px-6 py-3 font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                    >
                      <Lightbulb className="mr-2" size={16} />
                      Get Hint (-5 points)
                    </Button>
                  </div>
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
                    <div>Streak: <span className="font-bold">1</span></div>
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
                <div className="text-2xl font-bold text-slate-800">7</div>
                <div className="text-sm text-slate-600 font-medium">Total Guesses</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-emerald-600">4</div>
                <div className="text-sm text-slate-600 font-medium">Correct</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-indigo-600">{calculateAccuracy()}%</div>
                <div className="text-sm text-slate-600 font-medium">Accuracy</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-600">3</div>
                <div className="text-sm text-slate-600 font-medium">Best Streak</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Footer */}
        <footer className="text-center text-slate-600 space-y-4">
          <div className="flex justify-center space-x-6">
            <button className="hover:text-indigo-600 transition-colors duration-200 flex items-center">
              <RotateCcw className="mr-1" size={16} />
              Reset Game
            </button>
            <button className="hover:text-indigo-600 transition-colors duration-200 flex items-center">
              <Share className="mr-1" size={16} />
              Share Score
            </button>
            <button className="hover:text-indigo-600 transition-colors duration-200 flex items-center">
              <Trophy className="mr-1" size={16} />
              Leaderboard
            </button>
          </div>
          <p className="text-sm">Powered by Wikipedia API • Made with ❤️ for trivia lovers</p>
        </footer>
      </div>
    </div>
  );
}
