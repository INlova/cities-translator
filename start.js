import translate from './libs/google-translate-api';
import fs from 'fs';

function CitiesFactory(regionsDB) {
	
	this.regionsDB = prepareObjKeys(regionsDB);
	this.regions = getRegions();
	this.errorsStack = [];
	let translateCounter = 0;
	let codeArea = 0;
	let translateParams = {};
	let translatedDB = [];
	let nativeDB = [];
	let schemaDB = [];
	const options = {from: 'ru', to: 'uk', raw: true, res: false};

	let setTranslateParams = (string, params, dataOptions) =>{

		nativeDB[codeArea] = string
		
		delete dataOptions.options;
		delete dataOptions.text;
		
		schemaDB[codeArea] = dataOptions;

		translateParams = {
			text: string,
			options: params,
			codeArea: codeArea
		}

		codeArea++;
		return translateParams;
	}

	let getTranslateParams = () => translateParams;

	function prepareObjKeys(obj) { 
		return Object.keys(obj).reduce((init, key) => {
			return {...init, ...{[decodeURIComponent(key)]: obj[key]}};
		}, {});
	};

	function getRegions()  {
		return Object.keys(regionsDB);
	};

	this.getOblCity = (region) => decodeURIComponent(this.regionsDB[region].oblCity);

	this.getRegionCities = (region) => decodeURIComponent(this.regionsDB[region].cities);

	this.getTranslatedData = async () => {
		return translatedDB;
	};
	this.getDB = ()=> {
		return {
			translatedDB: translatedDB,
			nativeDB: nativeDB,
			schemaDB: schemaDB

		}
	}

	let saveDB = async () => {
		console.log('nativeDB.length is: '+nativeDB.length);
		console.log('translatedDB.length is: '+translatedDB.length);
		console.log('schemaDB.length is: '+schemaDB.length);

		fs.writeFile('./sorce/json/region_ciries_places_DB.json', JSON.stringify(this.getDB()), function (err) {
		    if (err) 
		        return console.log(err);
		    console.log('Wrote DB in file region_ciries_places_DB.json, just check it');
		});
		await console.log('finisshed');
	}

	let saveTranslated =  async (text, params) => {
		translateCounter++;
		translatedDB[params.codeArea] = text;
	}

	const getAllRegionsPromises = getRegions().map( async (region) => {
		//translate region
		let params = { dataType: 'region'};
		let translateParams = setTranslateParams(region, options, params);
		try{
			let translatedRegion = await translate(region, options);
			let savedTranslation = await saveTranslated(translatedRegion.text, {...params, ...translateParams});
		}catch(e){
			console.log(e);
			throw new Error('Region "'+region+'" didn`t translate!!! Translate module had return: '+JSON.stringify(e));
		}
	});

	const getAllRegionsCitiesPromises = Object.keys(this.regionsDB).map( (region) => {
		let regionIndex = nativeDB.indexOf(region);
		try{
			return this.regionsDB[region].cities.map( async (city) => {
				try{

					let params = {parent: regionIndex, dataType: 'city'};
					if(regionsDB[region].oblCity == city){
						params.oblCity = regionIndex;
					}
					let translateParams = setTranslateParams(decodeURIComponent(city), options, params);
					const savingParams = {...params, ...translateParams};
					const translatedCity = await translate(decodeURIComponent(city), options);
					let savedTranslation = await saveTranslated(translatedCity.text, {...params, ...translateParams});

				}catch(e){
					console.log(e);
					throw new Error('Region "'+region+'" didn`t translated!!! Translated module had return: '+JSON.stringify(e));
				}
			});
		}catch(e){
			console.log('Error in region - '+ region);
			console.log(e);
		}
	});
	
	let getAllDistricsPromises = this.regions.map( (region) => {
		let regionIndex = nativeDB.indexOf(region);

		const regionDistricts = Object.keys(this.regionsDB[region].oblastDistricts);
		try{
			return regionDistricts.map( async (district) => {
				try{
					let params = {parent: regionIndex, dataType: 'district'};
					let translateParams = setTranslateParams(decodeURIComponent(district), options, params);
					const savingParams = {...params, ...translateParams};
				
					const translatedDistrict = await translate(decodeURIComponent(district), options);
					let savedTranslation = await saveTranslated(translatedDistrict.text, {...params, ...translateParams});

				}catch(e){
					console.log(e);
					throw new Error('Region "'+region+'" didn`t translated!!! Translated module had return: '+JSON.stringify(e));
				}
			});
		}catch(e){
			console.log(region, e);
		}
	});

	let getDistrictsArray = () => {
		return this.regions.reduce((districts, region) => {

			let regionDistricts = Object.keys(this.regionsDB[region].oblastDistricts).filter((district) => {
				
				return regionsDB[region].oblastDistricts[district] 
						&& regionsDB[region].oblastDistricts[district].districtPlaces 
						&& regionsDB[region].oblastDistricts[district].districtPlaces.length > 0;
			});

			regionDistricts = regionDistricts.map((district) => { return {name: district, region: region}});
			return [...districts, ...regionDistricts];
		},[]);
	};

	let handleResponse = (res) => {

		let contentType = res.headers.get('content-type');

		if (contentType.includes('application/json')) {
			return res.json();
		}
		if (contentType.includes('text/html')) {
			return res.text();
		}

		throw new Error(`Content type ${contentType} not supported`);
	};

	let getCurrentDistrict = () => { return this.districts.pop(); };
	let getDistricts = () => { return this.districts };
	let findRegion = (district) => { 
		return this.regions.find((region) => {
					return Object.keys(this.regionsDB[region].oblastDistricts).indexOf(district) !=-1;
				});
	};

	let placeTranslatorGenerator = function* (){
		try{

			let district = getCurrentDistrict();
			let districtPlaces = regionsDB[district.region].oblastDistricts[district.name].districtPlaces;
			let districtPlacesPromises = districtPlaces.map( async(place)=>{

				let params = {parent: nativeDB.indexOf(district.name), dataType: 'place'};
				let translateParams = setTranslateParams(decodeURIComponent(place), options, params);
				let translatedObj = await translate(decodeURIComponent(place), options, true);
				await saveTranslated(translatedObj.text, {...params, ...translateParams});
				return translatedObj.text;
			});

			let districtPlacesResult = yield Promise.all(districtPlacesPromises);
			console.log('before timeout');
			yield new Promise(resolve => setTimeout(resolve, 3000));
			console.log('Will iterate '+getDistricts().length+' times. Go to the next district!!!');
			
			return getDistricts().length;
		
		}catch(e){
			console.log(e);
			//(e) => throw new Error('Error in generator with region - '+region+' in district - '+district+'!!! '+JSON.stringify(e));
		}
	};

	let executeGenerator = async (generator, value) => {

		let next = generator.next(value);
		if(!next.done) {
			next.value.then(
				result => {
					executeGenerator(generator, result);
				},
				error=> {
					generator.throw(error);
				}
			);
		} else if(next.value > 0){
			console.log('Lunch new generator');
			await executeGenerator(placeTranslatorGenerator());
		}else{
			console.log('Job complete!!!');
			await saveDB();
		}
	}

	let initDB = async () => {

		try{

			await Promise.all(getAllRegionsPromises).catch(e => console.log(e));

			for(let regionPromise of getAllRegionsCitiesPromises){

				await Promise.all(regionPromise).catch(e => console.log(e));
			}

			for(let districtPromise of getAllDistricsPromises){

				await Promise.all(districtPromise).catch(e => console.log(e));
			}

			await executeGenerator(placeTranslatorGenerator());

			console.log('Finish executeGenerator(placeTranslatorGenerator())');

		}catch(e){
			console.log('error in initDB!!!');
			console.log(e);
		}
	};
	let init = async () => {
		await initDB();
		console.log('Finished await initDB();');
	}

	this.districts = getDistrictsArray();
	init();
}

let groupedCitiesRuContent = '';
const groupedCitiesRuStream = fs.createReadStream('./sorce/json/region_ciries_places_formated.json', 'utf8');

groupedCitiesRuStream.on('data', (chunk)=> groupedCitiesRuContent += chunk).on('end', ()=> {
	console.log('Got groupedCitiesRuContent.');
	let citiesFactory = new CitiesFactory(JSON.parse(groupedCitiesRuContent));
});