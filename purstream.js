async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://api.purstream.me/api/v1/search-bar/search/${encodedKeyword}`);
        const data = await responseText.json();

        const transformedResults = data.data.items.movies.items.map(result => {
            if(result.type === "movie") {
                return {
                    title: result.title,
                    image: result.posters.original || result.posters.large || result.posters.small || result.posters.wallpaper,
                    href: `https://purstream.me/movie/${result.id}-${slugify(result.title)}`
                };
            }
            else if(result.type === "tv") {
                return {
                    title: result.title,
                    image: result.posters.original || result.posters.large || result.posters.small || result.posters.wallpaper,
                    href: `https://purstream.me/serie/${result.id}-${slugify(result.title)}`
                };
            }
        });


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

// searchResults("breaking bad");


// searchResults("breaking bad").then(console.log);
// extractDetails("https://movix.blog/tv/1396").then(console.log);
// extractEpisodes("https://movix.blog/tv/1396").then(console.log);
// extractStreamUrl("https://movix.blog/watch/tv/1396/s/1/e/1").then(console.log);

async function extractStreamUrl(url) {
    try {
        let streams = [];

        let showId = "";
        let seasonNumber = "";
        let episodeNumber = "";

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

        if (episodeNumber === "movie") {
            const response = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me",
                }
            });
            const json = await response.json();
            
            const data = json.data.items;
    
            for (const source of data.urls) {
                const streamUrl = source.url;

                streams.push({
                    title: source.name,
                    streamUrl,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        } else {
            const response = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await response.json();

            const data = json.data.items;

            for (const source of data.urls) {
                const pad2 = n => String(n).padStart(2, "0");

                const season = pad2(seasonNumber);
                const episode = pad2(episodeNumber);

                let streamUrl = source.url;

                if (streamUrl.includes("{season_number}")) {
                    streamUrl = streamUrl.replaceAll("{season_number}", season);
                }

                if (streamUrl.includes("{episode_number}")) {
                    streamUrl = streamUrl.replaceAll("{episode_number}", episode);
                }

                streams.push({
                    title: source.name,
                    streamUrl,
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

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);

        const result = {
            streams: [],
            subtitles: ""
        };

        console.log(result);
        return JSON.stringify(result);
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? 'GET',
            options.body ?? null,
            true,
            options.encoding ?? 'utf-8'
        );
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
