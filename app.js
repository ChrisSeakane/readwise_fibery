const express = require(`express`);
const path = require(`path`);
const logger = require(`morgan`);
const wrap = require(`express-async-wrap`);
const _ = require(`lodash`);
const uuid = require(`uuid-by-string`);
const got = require(`got`);
const spacetime = require(`spacetime`);

const app = express();
app.use(logger(`dev`));
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use(function (req, res, next) {
    console.log("Res: ", res);
    next();
});


app.get(`/logo`, (req, res) => res.sendFile(path.resolve(__dirname, `logo.svg`)));

const appConfig = require(`./config.app.json`);
app.get(`/`, (req, res) => res.json(appConfig));

app.post(`/validate`, wrap(async (req, res) => {  
    const token = req.body.fields.token;
    
    if (token != null) {
        const options = { headers: { 'Authorization': 'Token ' + token } };
        let response = await got('https://readwise.io/api/v2/auth/', options);    // add 401 handling code here

        if (response.statusCode === 204) {
            if (req.body.fields.connectionname) {
                return res.json({
                    name: `${req.body.fields.connectionname}`
                });                    
            }
            return res.json({
                name: 'Readwise'
            });
        }
    }

    //res.status(401).json({message: `Invalid access token`});
    
}));

const syncConfig = require(`./config.sync.json`);
app.post(`/api/v1/synchronizer/config`, (req, res) => res.json(syncConfig));

const schema = require(`./schema.json`);
app.post(`/api/v1/synchronizer/schema`, (req, res) => res.json(schema));

function getTitle(name) {
  let s = spacetime('2000',name);
  return {title:s.timezone().name, value:name};
}

app.post(`/api/v1/synchronizer/datalist`, wrap(async (req, res) => {
    let tzs = spacetime().timezones;
    let tzname = Object.keys(tzs);
    tzname = tzname.map(getTitle);
    const items = tzname.sort((a, b) => (a.title > b.title) ? 1: -1);
    res.json({items});
}));

app.post(`/api/v1/synchronizer/data`, wrap(async (req, res) => {
    
    let {requestedType, pagination, account, lastSynchronizedAt, filter} = req.body;
    
    const options = { headers: { 'Authorization': 'Token ' + account.token } };
    
    var url = 'https://readwise.io/api/v2/highlights?page_size=1';
    let response = await got(url, options);
    let body = JSON.parse(response.body);
    let next = body.next;
    let highlights = body.results;
    
    while (next !== null) {
        response = await got(next, options);
        body = JSON.parse(response.body);
        next = body.next;
        highlights = highlights.concat(body.results);
    } 
    
    if (requestedType !== `highlight` && requestedType != `book` && requestedType != `htag`) {
        throw new Error(`Only these database can be synchronized`);
    }
    
    const {timezone} = filter;
    const yearRange = [2023,2023];

    
    if (requestedType == `highlight`){
        let items = [];
        items = highlights.map(h => ({
            id:uuid((h.id).toString()),
            rw_id:h.id,
            name:h.text,
            color:h.color,
            location:h.location,
            highlighted_at:h.highlighted_at,
            updated:h.updated,
            url:h.url,
            note:h.note,
            location_type:h.location_type,
            book:h.book_id,
            tags:h.tags.map((t)=> t.id)
        }));
        
        
        /*
        let s = spacetime('2000',timezone);


            for (const year of yearRange) {
                s = s.year(year)
                console.log(s.leapYear()?366:365)
                for (let d = 1; d <= (s.leapYear()?2:2); d++) {
                    s = s.dayOfYear(d);
                    const item = s.json();
                    console.log(item);
                    item.date = item.year + "-" + (item.month +1) + "-" + item.date;
                    item.name = highlights[d-1].text;
                    item.timezone = s.timezone().name;
                    //item.timezone = timezone;
                    item.id = uuid(JSON.stringify(item));
                    const temp = {
                        number: 1,
                        name: "Week 1"
                    };
                    temp.id = uuid(JSON.stringify(temp));
                    item.week = 1;
                    items.push(item);
                }
            }
        */
        return res.json({items});
    }
    else if (requestedType == `book`){
        const items = [];
        const item = {
            name: "Book 1",
            rw_id: 26439564
        };
        item.id = uuid((item.rw_id).toString());
        items.push(item);
        return res.json({items});
    }
    else if (requestedType == `htag`){
        const items = [];
        let item = {
            name: "Tag 1",
            rw_id: 120783779
        };
        item.id = uuid((item.rw_id).toString());
        items.push(item);
        item = {
            name: "Tag 2",
            rw_id: 120799464
        };
        item.id = uuid((item.rw_id).toString());
        items.push(item);
        return res.json({items});
    }
}));

app.use(function (req, res, next) {
    const error = new Error(`Not found`);
    error.status = 404;
    next(error);
});

app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    res.json({message: err.message, code: err.status || 500});
});

module.exports = app;
