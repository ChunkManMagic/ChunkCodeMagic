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
  SUB_THEMES_MAP: {
    "Romance": ["Enemies to Lovers", "Slow Burn", "Fake Relationship", "Soulmates", "Second Chance", "Forbidden Affair", "Royalty & Guard"],
    "Horror": ["Haunted Relic", "Psychological Dread", "Body Horror", "Cursed Town", "Isolation", "Demonic Pact", "Creature Feature"],
    "Cyberpunk": ["Rogue AI", "Corporate Heist", "Memory Hack", "Neon Underworld", "Cybernetic Glitch", "Black Market Tech", "Rebel Grid"],
    "Fantasy": ["Lost Bloodline", "Ancient Prophecy", "Forgotten Gods", "Wild Magic", "Draconic Bond", "Arcane Academy", "Fae Bargains"],
    "Mystery": ["Locked Room", "Cold Case", "Unreliable Witness", "Secret Society", "Dead Man's Will", "Double Identity", "Framed Innocent"],
    "Sci-Fi": ["Derelict Station", "First Contact", "Dyson Sphere", "Time Loop", "Clone Dissonance", "Wormhole Drift", "Alien Hive"],
    "Noir": ["Femme Fatale", "Corrupt Police", "Midnight Rendezvous", "Missing Heiress", "Rain-Slick Alley", "Blackmail Ledger", "Smoky Lounge"],
    "Adventure": ["Sunken Ruins", "Cursed Expedition", "Treasure Map", "Sky Pirates", "Uncharted Island", "Bounty Hunt", "Jungle Tomb"],
    "Gothic": ["Crumbling Manor", "Ancestral Curse", "Bloodlines", "Ghostly Apparition", "Moonlit Crypt", "Obsessive Love", "Madness"],
    "Post-Apocalyptic": ["Scavenger Oasis", "Dust Storms", "Mutant Factions", "Last Radio Station", "Resource War", "Bunker Secrets", "Lost Tech"],
    "Steampunk": ["Clockwork Automaton", "Airship Armada", "Aether Engine", "Victorian Intrigue", "Guild Conspiracy", "Steam Powered Labs"],
    "Historical": ["Courtly Espionage", "Warring Dynasties", "Siege Defense", "Rebellion", "Royal Decree", "Trade Caravan", "Knights Templar"],
    "Comedy": ["Mistaken Identity", "Chaos Magic", "Snarky Companion", "Catastrophic Luck", "Absurd Bet", "Awkward Dates", "Bumbling Villains"],
    "Tragedy": ["Inevitable Doom", "Broken Oath", "Fateful Sacrifice", "Betrayed Trust", "Fading Memory", "Bitter Requiem", "Lost Glory"],
    "Intrigue": ["Masquerade Secrets", "Poisoner's Ring", "Shadow Council", "Double Agent", "Coup D'état", "Stolen Dossier", "Court Whispers"],
    "Survival": ["Bitter Winter", "Hostile Wilderness", "Starvation", "Predator Stalking", "Shelter Defense", "Emergency Beacon", "Last Match"],
    "Heist": ["The Inside Job", "Master Safe-Cracker", "Getaway Driver", "Vault Blueprint", "Laser Grid", "Switcheroo", "Betrayal at Split"],
    "Political": ["Puppet Monarch", "Electoral Rigging", "Treaty Negotiations", "Embargo", "Popular Uprising", "Corrupt Oligarchs", "Propaganda"],
    "Military": ["Behind Enemy Lines", "Trenches", "Veteran Squad", "Tactical Ambush", "Chain of Command", "Siege Warfare", "Honor Code"],
    "Slice of Life": ["Late Night Diner", "Neighborhood Secrets", "Rainy Afternoon", "Art Studio", "Rooftop Talks", "Warm Tea & Hearth", "Old Records"],
    "Eldritch": ["Cosmic Madness", "Non-Euclidean Geometry", "Whispering Stars", "Tome of Forbidden Lore", "Deep Sea Chasm", "Void Cult"],
    "Space Opera": ["Galactic Empire", "Starfighter Dogfight", "Alien Syndicate", "Hyperspace Jump", "Emperor's Guard", "Planetary Blockade"],
    "Wuxia": ["Martial Arts Sect", "Qi Cultivation", "Secret Manual", "Vengeance Oath", "Bamboo Forest Duel", "Immortal Master", "Tea House Feud"],
    "Urban Fantasy": ["Hidden Arcane Alley", "Vampire Syndicate", "Modern Witchcraft", "Werewolf Turf War", "Magic Underground", "Detective Mage"],
    "Western": ["Dusty High Noon", "Saloon Showdown", "Train Robbery", "Corrupt Sheriff", "Ghost Town", "Gold Rush", "Lone Drifter"],
    "Sensual Romance": ["Whispered Confessions", "Silk & Candlelight", "Intense Glances", "Slow Undressing", "Irresistible Pull", "Midnight Embrace"],
    "Dark Erotica": ["Sweet Torment", "Dangerous Liaisons", "Velvet Restraints", "Shadowed Desires", "Forbidden Obsession", "Clandestine Touch"],
    "Power Dynamics": ["Dominance & Surrender", "Commanding Presence", "Subtle Submission", "Collared Heart", "Control Games", "Unspoken Authority"],
    "Forbidden Love": ["Stolen Midnight Kisses", "Opposite Factions", "Secret Marriage", "Taboo Touch", "Guarded Hearts", "Exile Together"],
    "Obsession": ["Unwavering Gaze", "Collected Souvenirs", "Possessive Claim", "Haunted Thoughts", "Every Waking Breath", "No Escape"],
    "Seduction": ["Luring Smile", "Poisoned Honey", "Velvet Words", "Irresistible Trap", "Slow Temptation", "Playing with Fire"],
    "Taboo": ["Unforgivable Passion", "Breaking Sacred Vows", "Guilty Pleasure", "Secret Room", "Society's Condemnation", "Crossed Lines"]
  } as Record<string,string[]>,
  maxFor(mature: boolean){ return mature ? this.MAX_TOTAL : this.MAX_STANDARD },
  offlineLevelTwoFor(picks: string[], mature: boolean): string[] {
    if (picks.length === 0) return ["Rival Alliance", "Ancient Mystery", "Dangerous Bargain", "Hidden Truth", "Midnight Encounter", "Final Stand"];
    const themes = [...new Set(picks.flatMap(k => this.SUB_THEMES_MAP[k] || []))];
    const pool = themes.length >= 8 ? themes : [...new Set([...themes, "Rival Alliance", "Ancient Mystery", "Dangerous Bargain", "Hidden Truth", "Midnight Encounter", "Final Stand"])];
    return pool.sort(() => Math.random() - 0.5).slice(0, 8);
  },
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
