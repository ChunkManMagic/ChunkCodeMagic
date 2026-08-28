export const SubjectMatters = {
  MAX_STANDARD: 5,
  MAX_MATURE_EXTRA: 2,
  MAX_TOTAL: 7,
  STANDARD_POOL: [
    "Romance","Horror","Cyberpunk","Fantasy","Mystery","Sci-Fi","Noir","Adventure",
    "Gothic","Post-Apocalyptic","Steampunk","Historical","Comedy","Tragedy","Intrigue",
    "Survival","Heist","Political","Military","Slice of Life","Eldritch","Space Opera","Wuxia","Urban Fantasy","Western"
  ] as const,
  STANDARD_INITIAL: [] as string[], // filled after
  MATURE_POOL: ["Sensual Romance","Dark Erotica","Power Dynamics","Forbidden Love","Obsession","Seduction","Taboo"] as const,
  OFFLINE_STARTERS: {
    "Romance": ["Two rivals forced to share a crumbling manor discover letters that rewrite their feud.","A matchmaker who never loved must fake a romance to save her town."],
    "Horror": ["The house hums at 3:13 a.m. and knows your name.","You inherit a lighthouse that warns ships away from you."],
    "Cyberpunk": ["A courier with a dead stranger's memories must deliver them before they overwrite her.","Neon rain erases faces — yours is next."],
    "Fantasy": ["A map that only shows roads you haven't regretted yet.","The last dragon offers a bargain: your voice for a year of rain."],
    "Mystery": ["Every clock in town stopped when she left — except yours.","A detective who cannot lie must solve a murder built on one."],
    "Sci-Fi": ["The colony AI replicates your childhood home perfectly — except one room.","You wake with 24 hours of someone else's life in your head."],
    "Noir": ["A washed-up PI takes a case from his future self.","Rain-slick streets hide a city that only exists at night."],
    "Adventure": ["The compass points to what you most fear to lose.","Three tickets, two seats on the last airship out."],
    "Gothic": ["An abbey where portraits age while you don't.","Letters from your widow arrive before you've married."],
    "Post-Apocalyptic": ["You tend a library in a world that burned its books.","The last seed bank opens only for a song no one remembers."],
    "Comedy": ["Your familiar is more competent than you and files complaints.","A prophecy misprints your name and the dark lord is confused."],
    "Intrigue": ["Everyone at the masquerade knows your secret — you just don't know theirs.","A sealed letter contains your alibi for tomorrow."],
    "Sensual Romance": ["Consenting hearts test boundaries in a silk-draped manor where trust is the real wager.","A slow burn where every glance negotiates power."],
    "Dark Erotica": ["Obsession and consent entwine in a gothic estate where safe words are law.","Two rivals explore a dangerous attraction that could ruin them."],
    "Power Dynamics": ["A mentor and protégé blur lines while consent remains the compass.","Who holds the leash when both want to be led?"],
    "Forbidden Love": ["Love that society forbids, negotiated with aching care between adults.","A secret affair in a city of watchers."],
  } as Record<string,string[]>,
  GENERIC_OFFLINE: [
    "A stranger offers you a key to a door you've never seen.",
    "The city forgets you every night at midnight — except one person.",
    "You find a book where your future is already written in the margins.",
    "An old map marks a place that shouldn't exist — in your backyard.",
    "Every mirror shows a slightly different you — one of them waves back.",
  ],
  RELATED_MAP: {
    "Romance": ["Forbidden Love","Comedy","Tragedy","Slice of Life"],
    "Horror": ["Gothic","Eldritch","Survival","Mystery"],
    "Cyberpunk": ["Noir","Political","Heist","Sci-Fi"],
    "Fantasy": ["Wuxia","Eldritch","Adventure","Gothic"],
    "Mystery": ["Noir","Intrigue","Political","Horror"],
    "Sci-Fi": ["Space Opera","Post-Apocalyptic","Cyberpunk","Intrigue"],
    "Noir": ["Mystery","Intrigue","Crime","Gothic"],
    "Adventure": ["Survival","Heist","Exploration","Fantasy"],
    "Gothic": ["Horror","Romance","Mystery","Tragedy"],
    "Comedy": ["Slice of Life","Intrigue","Adventure","Romance"],
    "Sensual Romance": ["Power Dynamics","Seduction","Forbidden Love"],
    "Power Dynamics": ["Obsession","Taboo","Seduction"],
  } as Record<string,string[]>,
  maxFor(mature: boolean){ return mature ? this.MAX_TOTAL : this.MAX_STANDARD },
  offlineSuggestionsFor(picks: string[], mode: string, mature: boolean, count = mature ? 7 : 5){
    if (picks.length===0) return this.GENERIC_OFFLINE.slice(0,count)
    const pooled = picks.flatMap(k=> this.OFFLINE_STARTERS[k] || this.GENERIC_OFFLINE)
    const uniq = [...new Set(pooled)]
    const tuned = uniq.map(s=>{
      if (mode==="SCENARIO") return `Crisis: ${s}`
      if (mode==="GAME") return `Quest: ${s}`
      if (mode==="NARRATIVE") return `Premise: ${s}`
      return `Hook: ${s}`
    })
    if (tuned.length>=count) return tuned.sort(()=>Math.random()-0.5).slice(0,count)
    return [...new Set([...tuned, ...this.GENERIC_OFFLINE])].slice(0,count)
  },
  dynamicFor(picks: string[], mature: boolean){
    if (picks.length===0) return []
    const related = [...new Set(picks.flatMap(k=> this.RELATED_MAP[k] || []))].filter(x=> !picks.includes(x))
    const pool = [...(mature? this.MATURE_POOL as unknown as string[]:[]), ...this.STANDARD_POOL]
    const remaining = pool.filter(x=> !picks.includes(x) && !related.includes(x))
    return [...related, ...remaining.sort(()=>Math.random()-0.5)].slice(0,6)
  }
}
SubjectMatters.STANDARD_INITIAL = SubjectMatters.STANDARD_POOL.slice(0,12)
