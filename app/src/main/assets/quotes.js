const quotes = [
  { text: "Order and simplification are the first steps toward the mastery of a subject.", author: "Thomas Mann" },
  { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  { text: "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.", author: "Buddha" },
  { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan" },
  { text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein" },
  { text: "To know the ancient world is to know ourselves.", author: "Flinders Petrie" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" }
]

function getRandomQuote()
{
  const index = Math.floor(Math.random() * quotes.length)
  return quotes[index]
}