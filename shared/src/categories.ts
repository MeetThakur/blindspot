export interface Category {
  id: string;
  name: string;
  items: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'pokemon',
    name: 'Pokémon',
    items: ['Pikachu', 'Charizard', 'Bulbasaur', 'Squirtle', 'Jigglypuff', 'Meowth', 'Psyduck', 'Snorlax', 'Eevee', 'Mewtwo', 'Gengar', 'Lucario', 'Magikarp', 'Gyarados', 'Togepi', 'Onix', 'Machamp', 'Vulpix', 'Slowpoke', 'Lapras', 'Dragonite', 'Mimikyu', 'Greninja', 'Piplup'],
  },
  {
    id: 'anime',
    name: 'Anime characters',
    items: ['Goku', 'Naruto Uzumaki', 'Luffy', 'Sailor Moon', 'Totoro', 'Light Yagami', 'Eren Yeager', 'Spike Spiegel', 'Edward Elric', 'Saitama', 'Mikasa Ackerman', 'Tanjiro Kamado', 'Vegeta', 'Sasuke Uchiha', 'Satoru Gojo', 'Chihiro', 'Ash Ketchum', 'Lelouch', 'Asuka Langley', 'Killua Zoldyck', 'Zoro', 'Nezuko', 'Deku', 'Sakura Haruno'],
  },
  {
    id: 'movie-tv',
    name: 'Movie & TV characters',
    items: ['Darth Vader', 'Harry Potter', 'Sherlock Holmes', 'Homer Simpson', 'Shrek', 'Gandalf', 'Jack Sparrow', 'Elsa', 'Walter White', 'Yoda', 'Forrest Gump', 'Indiana Jones', 'Hermione Granger', 'Buzz Lightyear', 'Michael Scott', 'Daenerys Targaryen', 'The Joker', 'Dory', 'Mario', 'Rocky Balboa', 'Marty McFly', 'Spongebob Squarepants', 'Eleven', 'Gollum'],
  },
  {
    id: 'superheroes',
    name: 'Superheroes',
    items: ['Superman', 'Batman', 'Spider-Man', 'Wonder Woman', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Black Panther', 'Black Widow', 'The Flash', 'Aquaman', 'Wolverine', 'Deadpool', 'Doctor Strange', 'Green Lantern', 'Catwoman', 'Ant-Man', 'Captain Marvel', 'Storm', 'Hawkeye', 'Robin', 'Supergirl', 'Groot'],
  },
  {
    id: 'celebrities',
    name: 'Celebrities',
    items: ['Taylor Swift', 'Beyoncé', 'Albert Einstein', 'Leonardo DiCaprio', 'Oprah Winfrey', 'Elon Musk', 'Lionel Messi', 'Serena Williams', 'Michael Jackson', 'Marilyn Monroe', 'Keanu Reeves', 'Dwayne Johnson', 'Rihanna', 'Cristiano Ronaldo', 'Barack Obama', 'Bill Gates', 'Zendaya', 'Tom Hanks', 'Lady Gaga', 'Michael Jordan', 'Freddie Mercury', 'Emma Watson', 'Ed Sheeran', 'Gordon Ramsay'],
  },
  {
    id: 'animals',
    name: 'Animals',
    items: ['Elephant', 'Giraffe', 'Penguin', 'Octopus', 'Kangaroo', 'Dolphin', 'Platypus', 'Flamingo', 'Chameleon', 'Panda', 'Koala', 'Hedgehog', 'Peacock', 'Sloth', 'Narwhal', 'Axolotl', 'Red Panda', 'Capybara', 'Bald Eagle', 'Komodo Dragon', 'Seahorse', 'Meerkat', 'Orangutan', 'Hummingbird'],
  },
  {
    id: 'objects',
    name: 'Everyday objects',
    items: ['Toothbrush', 'Umbrella', 'Microwave', 'Backpack', 'Scissors', 'Alarm Clock', 'Sofa', 'Headphones', 'Frying Pan', 'Light Bulb', 'Bicycle', 'Remote Control', 'Sunglasses', 'Stapler', 'Mirror', 'Kettle', 'Water Bottle', 'Wallet', 'Candle', 'Ladder', 'Toaster', 'Pillow', 'Paperclip', 'Vacuum Cleaner'],
  },
  {
    id: 'video-games',
    name: 'Video game characters',
    items: ['Mario', 'Link', 'Sonic', 'Pac-Man', 'Lara Croft', 'Master Chief', 'Kirby', 'Donkey Kong', 'Samus Aran', 'Pikachu', 'Steve', 'Princess Peach', 'Crash Bandicoot', 'Mega Man', 'Cloud Strife', 'Geralt of Rivia', 'Kratos', 'Yoshi', 'Zelda', 'Ryu', 'Bowser', 'Tails', 'Isabelle', 'Ezio Auditore'],
  },
];

export function findCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
