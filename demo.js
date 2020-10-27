const CalendarIndexer = require('./index.js');
const moment = require('moment-timezone');


const timeZone = 'Asia/Shanghai';


(async () => {


	let calendarIndexer = new CalendarIndexer();
	let curDate = moment.tz(moment().clone().tz(timeZone), timeZone)
	let lunarData = await calendarIndexer.indexChineseLunar(curDate);
	console.log(lunarData);

})();  //end top async()
