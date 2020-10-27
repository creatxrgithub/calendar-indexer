# chinese lunar calendar indexer 中國農曆黃曆查詢器

```
const CalendarIndexer = require('chinese-calendar-indexer');
const moment = require('moment-timezone');


const timeZone = 'Asia/Shanghai';


(async () => {

	try {

		let calendarIndexer = new CalendarIndexer();
		let curDate = moment.tz(moment().clone().tz(timeZone), timeZone)
		let lunarData = await calendarIndexer.indexChineseLunar(curDate);
		console.log(lunarData);

	} catch(e) {
		console.log(e);
	}

})();  //end top async()
```
output is:

```
{
  year: 2020,
  month: 10,
  day: 28,
  lunarMonth: '九月',
  lunarMonthDigit: 9,
  lunarDay: '十二',
  lunarDayDigit: 12,
  isLunarLeapMonth: false,
  chineseYear: '庚子',
  chineseMonth: '丙戌',
  chineseDay: '甲辰',
  chineseTerm: '霜降',
  chineseTermOffset: 5
}
```
