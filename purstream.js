async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://api.purstream.me/api/v1/search-bar/search/${encodedKeyword}`);
        const data = await responseText.json();

        // On vérifie que l'API a bien renvoyé des films
        if (!data?.data?.items?.movies?.items) {
             return JSON.stringify([]);
        }

        const transformedResults = data.data.items.movies.items.map(result => {
            
            // Récupération de l'image (poster)
            let imgUrl = result.large_poster_path || result.small_poster_path || result.wallpaper_poster_path || "https://via.placeholder.com/300x450/222222/FFFFFF?text=Aucune+Affiche";

            if(result.type === "movie") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://purstream.me/movie/${result.id}-${slugify(result.title)}`
                };
            }
            else if(result.type === "tv") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://purstream.me/serie/${result.id}-${slugify(result.title)}`
                };
            }
        }).filter(Boolean); // Filtre les résultats vides

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

function slugify(title) {
    return title
      .toLowerCase()
      .normalize("NFKD")                 // remove accents
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")      // remove symbols
      .trim()
      .replace(/\s+/g, "-")              // spaces → dash
      .replace(/-+/g, "-");              // collapse dashes
}

async function extractDetails(url) {
    try {
        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${movieId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await responseText.json();

            const data = json.data.items;

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.runtime.minutes ? data.runtime.minutes + " minutes" : 'N/A'}`,
                airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
            }];

            return JSON.stringify(transformedResults);
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await responseText.json();

            const data = json.data.items;

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: N/A`,
                airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
            }];

            return JSON.stringify(transformedResults);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];

            return JSON.stringify([
                { href: `${movieId}/movie`, number: 1, title: "Full Movie" }
            ]);
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            const showId = match[1];

            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await responseText.json();

            const data = json.data.items;
            let allEpisodes = [];

            for (let i = 1; i <= data.seasons; i++) {
                const seasonResponseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/season/${i}`, {
                    headers: {
                        "Referer": "https://purstream.me/",
                        "Origin": "https://purstream.me"
                    }
                });
                const seasonJson = await seasonResponseText.json();

                const seasonData = seasonJson.data.items;

                for (const episode of seasonData.episodes) {
                    const episodeData = {
                        href: `${showId}/${i}/${episode.episode}`,
                        number: episode.episode,
                        title: episode.name
                    };
                    allEpisodes.push(episodeData);
                }
            }
            
            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }    
}

async function extractStreamUrl(url) {
    try {
        let streams = [];

        let showId = "";
        let seasonNumber = "";
        let episodeNumber = "";

        // Récupération des IDs depuis le href généré par extractEpisodes
        if (url.includes('movie')) {
            const [showIdTemp, episodeNumberTemp] = url.split('/');
            showId = showIdTemp;
            episodeNumber = episodeNumberTemp;
        } else {
            const [showIdTemp, seasonNumberTemp, episodeNumberTemp] = url.split('/');
            showId = showIdTemp;
            seasonNumber = seasonNumberTemp;
            episodeNumber = episodeNumberTemp;
        }

        // Construction de la bonne URL de l'API Stream selon si c'est un film ou une série
        let apiUrl = "";
        if (episodeNumber === "movie") {
            // API pour les films
            apiUrl = `https://api.purstream.me/api/v1/stream/${showId}`;
        } else {
            // API pour les séries
            apiUrl = `https://api.purstream.me/api/v1/stream/${showId}/episode?season=${seasonNumber}&episode=${episodeNumber}`;
        }

        // Appel de l'API de streaming pour récupérer le lien direct avec le Token
        const response = await soraFetch(apiUrl, {
            headers: {
                "Referer": "https://purstream.me/",
                "Origin": "https://purstream.me",
            }
        });
        const json = await response.json();
        
        // On récupère le tableau "sources"
        const sources = json?.data?.items?.sources || [];

        // On ajoute chaque source à notre liste
        for (const source of sources) {
            if (source.stream_url) {
                streams.push({
                    title: source.source_name || "Source 1",
                    streamUrl: source.stream_url, // Le lien complet avec le token et signature
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        }

        const results = {
            streams,
            subtitles: ""
        };

        return JSON.stringify(results);

    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(
                url,
                options.headers ?? {},
                options.method ?? 'GET',
                options.body ?? null,
                true,
                options.encoding ?? 'utf-8'
            );
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
