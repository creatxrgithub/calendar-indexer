/**
 * 使用從香港天文臺下載的農曆數據
 */
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
//const pEvent = require('p-event');  //可將 event 轉爲等待 await
const StreamZip = require('node-stream-zip');

//const csv2array = require( fs.existsSync('csv2array_regular') ? 'csv2array_regular' : '../csv2array_regular' );
const csv2array = require.resolve.paths('csv2array_regular');
//console.log(path.basename(__dirname));
//console.log(csv2array);
const timeZone = 'Asia/Shanghai';
const tiangan = '甲乙丙丁戊己庚辛壬癸';
const dizhi = '子丑寅卯辰巳午未申酉戌亥';
const chineseTerm = ['立春','雨水','驚蟄','春分','清明','穀雨','立夏','小滿','芒種','夏至','小暑','大暑','立秋','處暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒'];
const chineseMonth = '寅寅卯卯辰辰巳巳午午未未申申酉酉戌戌亥亥子子丑丑';
const lunarMonthNameArr = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const lunarDayNameArr = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const dateBase = [
	{'date':'2000-01-01','chineseDay':'戊午'},
	{'date':'2020-01-01','chineseDay':'癸卯'},
];
let baseDate = new moment.tz(dateBase[0].date, 'YYYY-MM-DD', timeZone);


//年上起月法：甲己之年丙作首，乙庚之歲戊爲頭，丙辛之歲尋庚上，丁壬壬寅順水流，若問戊癸何處起，甲寅之上好追求。

//日上起時法口訣：甲己起甲（子），乙庚起丙（子），丙辛起戊(子),丁壬起庚（子），戊癸起壬（子）。

class CalendarIndexer {
	constructor() {
		this.dataDir = path.join(__dirname,'data');
		this.curYear = null;
		this.curCal = null;
	}

	/*
	 * 根據西元年份求年的干支
	 */
	static getChineseYearByYear(year) {
		return tiangan[((year-3)%10-1+10)%10] + dizhi[((year-3)%12-1+12)%12];
	}

	static getChineseTermOrMonth(value) {
		let index = chineseTerm.indexOf(value);
		if(index!=-1) return chineseMonth[index];

		index = chineseMonth.indexOf(value.match(`[${dizhi}]`,'g'));
		if(index!=-1) return chineseTerm[index];

		return '';
	}

	static getTianganByOffset(tg,offset) {
		return tiangan[((tiangan.indexOf(tg)+offset)%10+10)%10];
	}

	static getDizhiByOffset(dz,offset) {
		return dizhi[((dizhi.indexOf(dz)+offset)%12+12)%12];
	}

	static getGanzhiByOffset(gz,offset) {
		return CalendarIndexer.getTianganByOffset(gz[0],offset) + CalendarIndexer.getDizhiByOffset(gz[1],offset);
	}

	/*
	 * 年上起月法
	 */
	static getChineseMonthGanzhi(yearTiangan,monthDizhi) {
		let firstMonthTiangan = '丙戊庚壬甲丙戊庚壬甲';
		let index = tiangan.indexOf(firstMonthTiangan[tiangan.indexOf(yearTiangan)]);
		let offset = (dizhi.indexOf(monthDizhi)-2+12)%12;  //將位移量轉成正數
		return tiangan[(index+offset)%10] + monthDizhi;
	}

	/*
	 * 日上起時法
	 */
	static getChineseHourGanzhi(dayTiangan,hourDizhi) {
		let firstHourTiangan = '甲丙戊庚壬甲丙戊庚壬';
		let index = tiangan.indexOf(firstHourTiangan[tiangan.indexOf(dayTiangan)]);
		let offset = (dizhi.indexOf(hourDizhi)+12)%12;  //將位移量轉成正數
		return tiangan[(index+offset)%10] + hourDizhi;
	}

	static lunarMonthToDigit(lunarMonthName) {
		return lunarMonthNameArr.indexOf(lunarMonthName.match(/[^閏]+/,'g').toString())+1;
	}

	static lunarDayToDigit(lunarDayName) {
		return lunarDayNameArr.indexOf(lunarDayName)+1;
	}

	/**
	 * { year:0, month:0, day:0,
	 * lunarMonth:'', lunarMonthDigit:0, lunarDay:'', lunarDayDigit:0, isLunarLeapMonth:false,
	 * chineseYear:'', chineseMonth:'', chineseDay:'',
	 * chineseTerm:'', chineseTermOffset:'' }
	 */
	async indexChineseLunar(year,month,day) {
		if(arguments.length<3) {
			if(arguments.length>0) {
				return this.indexChineseLunarByDateObj(arguments[0]);
			} else { return {}; }
		}

		let retData = { year: parseInt(year), month:parseInt(month), day:parseInt(day),
			lunarMonth:'', lunarMonthDigit:0, lunarDay:'', lunarDayDigit:0, isLunarLeapMonth:false,
			chineseYear:'', chineseMonth:'', chineseDay:'',
			chineseTerm:'', chineseTermOffset:'' };

		if(this.curYear!=retData.year) {
			try {
				if(fs.existsSync(path.join(this.dataDir, 'calendar', `T${retData.year}c.txt`))) {
					this.curCal = csv2array.toArray(path.join(this.dataDir, 'calendar', `T${retData.year}c.txt`),/\s+/);
				} else if(fs.existsSync(path.join(this.dataDir,'calendar.zip'))) {
					//改用讀取 zip 需使用 async await
					//使用 async-await 實現，函數要加上 async 關鍵字，調用時可使用頂部 (async () => {   //TODO: result = await function return   })();
					const zip = new StreamZip({ file: path.join(this.dataDir,'calendar.zip'), storeEntries: true });
					//await pEvent(zip, 'ready');
					await new Promise(fulfilled => zip.on("ready", fulfilled));
					let data = Buffer.from(zip.entryDataSync(`T${retData.year}c.txt`)).toString('utf8').split(/[\r\n]+/);
					//console.log(Buffer.isBuffer(data));
					this.curCal = [];
					for(let row of data) this.curCal.push(row.split(/\s+/));
					zip.close();
				} else {
					throw new Error('not found chinese calendar data');
				}
			} catch(e) {
				console.log(e);
				console.log(path.join(this.dataDir, 'calendar'));
				return retData;  //沒有數據就返回初始化的數據
			}
			this.curYear = retData.year;
		}
		let curDate = moment.tz(`${retData.year}-${retData.month}-${retData.day}`, 'YYYY-MM-DD', timeZone);
		let offset = curDate.diff(baseDate,'days');
		retData.chineseDay = CalendarIndexer.getGanzhiByOffset(dateBase[0].chineseDay,offset);
		retData.chineseYear = this.curCal[0].join('').match(new RegExp(`[${tiangan}][${dizhi}]`,'g')).toString();
		let index = this.curCal.findIndex((data) => {return data.toString().match(new RegExp(`${retData.year}年0?${retData.month}月0?${retData.day}日`,'g')); });
		//如果在立春前，取前一年的干支
		if(index<this.curCal.findIndex((data) => { return data.includes(chineseTerm[0]); })) {
			retData.chineseYear = CalendarIndexer.getGanzhiByOffset(retData.chineseYear,-1);
		}
		retData.chineseMonth = '';
		for(let i=index; i>1; i--) {  //向前查找
			let chineseTermIndex = chineseTerm.indexOf(this.curCal[i][3]);
			if(chineseTermIndex!=-1) {
				retData.chineseMonth = chineseMonth[chineseTermIndex];  //查表法最簡單
				//如果可以查到就可以計算節氣內第幾天
				retData.chineseTerm = this.curCal[i][3];
				retData.chineseTermOffset = index-i;
				break;
			}
		}
		if(retData.chineseMonth=='') {  //向後查找
			for(let i=index; i<this.curCal.length; i++) {
				let chineseTermIndex = chineseTerm.indexOf(this.curCal[i][3]);
				if(chineseTermIndex!=-1) {
					//可能是子月或丑月，查表法最簡單
					retData.chineseMonth = chineseMonth[(chineseTermIndex-1+24)%24];
					retData.chineseTerm =chineseTerm[(chineseTermIndex-1+24)%24];
					//不讀取前一年的日曆，只知本節氣內倒數第幾天，卽下一節氣前幾天
					//retData.chineseTermOffset = index-i;  //+15 有可能不準確
					retData.chineseTermOffset = index-i+15;  //+15 有可能不準確。節氣肯定都是 15 天？
					break;
				}
			}
		}
		retData.chineseMonth = CalendarIndexer.getChineseMonthGanzhi(retData.chineseYear[0],retData.chineseMonth);

		let lunarOffset = lunarDayNameArr.indexOf(this.curCal[index][1]);

		if(lunarOffset<=0) {
			retData.lunarMonth = `${this.curCal[index][1]}`;
			retData.lunarDay = '初一';
			retData.lunarDayDigit = 1;
		} else {
			if((index-lunarOffset)>1) {
				retData.lunarMonth = `${this.curCal[index-lunarOffset][1]}`;
			} else {
				try {
					//這種檢索方法無法得知本月（比如十二月）是否閏月
					let nextLunarMonthIndex = this.curCal.findIndex((data) => {return data[1].toString().match(new RegExp(/閏?.+月/,'g')); }, index);
					retData.lunarMonth = lunarMonthNameArr[(lunarMonthNameArr.indexOf(this.curCal[nextLunarMonthIndex][1])-1+12)%12];
				} catch(e) { retData.lunarMonth = ''; }
			}
			retData.lunarDay = `${this.curCal[index][1]}`;
			retData.lunarDayDigit = CalendarIndexer.lunarDayToDigit(retData.lunarDay);
			retData.lunarMonthDigit = CalendarIndexer.lunarMonthToDigit(retData.lunarMonth);
		}
		retData.lunarMonthDigit = CalendarIndexer.lunarMonthToDigit(retData.lunarMonth);
		if(retData.lunarMonth.match(/閏/,'g')) retData.isLunarLeapMonth = true;

		return retData;
	}

	indexChineseLunarByDateObj(dateObj) {
		let curDate = moment.tz(dateObj, timeZone);
		let [year,month,day] = curDate.format('YYYY-M-D').split('-');
		return this.indexChineseLunar(year,month,day);
	}
}

module.exports = CalendarIndexer;
