const { readdirSync } = require('fs');
const { promisify } = require('util');
const path = require('path');
const NodeID3 = require('node-id3');
const got = require('got');
const cheerio = require('cheerio');

const FOLDER_PATH = process.argv[2];
if (!FOLDER_PATH) {
	throw new Error('You must provide a path to a folder with song tracks to analyze');
}

const GENRES_MAPPING = {
	'House': 'Pure House',
	'Dance': 'Pure Dance'
};

// 5 - House, 12 - Deep House, 11, Tech House, 39 - Dance, 17 - Electro House, 65 - Future House, 91 - Bass House
const PREFERRED_GENRES_IDS = [5, 12, 11, 39, 17, 65, 91];

const delay = (timeout) => new Promise(resolve => setTimeout(resolve, timeout));

const readTrackTags = filePath => {
	return new Promise((resolve, reject) => {
		NodeID3.read(filePath, (error, tags) => {
			if (error) {
				return reject(error);
			} else {
				return resolve(tags)
			}
		});
	});
}

const getText = ($element, selector) => {
	const text = $element.find(selector).text();
	return text.replace(/\n/g, '').trim();
}


function doesTextsMatch(textA, textB) {
	return textA.toLowerCase().includes(textB.toLowerCase()) ||
		textB.toLowerCase().includes(textA.toLowerCase());
}

function calculateSearchResultScore(trackTags, searchResult) {
	let score = 0;
	
	if (doesTextsMatch(searchResult.primaryTitle, trackTags.title)) {
		score += 25;
	}
	if (doesTextsMatch(searchResult.secondaryTitle, trackTags.title)) {
		score += 5;
	}
	searchResult.artists.forEach(artist => {
		if (doesTextsMatch(artist, trackTags.artist)) {
			score += 10;
		}
	});
	if (PREFERRED_GENRES_IDS.includes(searchResult.genreId)) {
		score += 5;
	}

	return score;
}

function filterGenre(genre) {
	return GENRES_MAPPING[genre] || genre;
}

async function searchTrack(trackTags) {
	// https://www.beatport.com/search?q=Diplo%3B+SIDEPIECE+-+On+My+Mind
	const query = encodeURIComponent(`${trackTags.artist} - ${trackTags.title}`);
	const { body } = await got(`https://www.beatport.com/search?q=${query}`);
	const $ = cheerio.load(body);
	const results = [];
	const $results = $('.bucket.tracks.standard-interior-tracks .bucket-items .track');
	
	$results.each((_, element) => {
		const $result = $(element);
		const searchResult = {
			artists: getText($result, '.buk-track-artists').split(',').map(token => token.trim()),
			primaryTitle: getText($result, '.buk-track-title .buk-track-primary-title'),
			secondaryTitle: getText($result, '.buk-track-title .buk-track-remixed'),
			originalGenreName: getText($result, '.buk-track-genre'),
			genreId: $result.find('.buk-track-genre a').data('genre'),
			
		};
		searchResult.genreName = filterGenre(searchResult.originalGenreName);
		searchResult.score = calculateSearchResultScore(trackTags, searchResult);
		results.push(searchResult);
	});

	results.sort((a, b) => b.score - a.score);

	return results;
}


async function start() {
	try {
		let index = 0;
		const files = readdirSync(FOLDER_PATH);
		for (let fileName of files) {
			const filePath = path.join(FOLDER_PATH, fileName);
			const trackTags = await readTrackTags(filePath);
			console.log('File name:', fileName);
			console.log(`Track title: ${trackTags.artist} - ${trackTags.title}`);
			const searchResults = await searchTrack(trackTags);
			console.log('Search results:', searchResults);
			console.log('-------------------------------------');
			delay(500);
			if (index++ > 10) {
				break;
			}
		}
	} catch (error) {
		console.error(error);
	}
}

start();
