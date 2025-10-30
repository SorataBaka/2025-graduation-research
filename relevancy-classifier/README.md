# Information section for this folder

The parsed data obtained from the database is in the form of a bson file. This file contains binary data that can't be easily read and contains twitter data that is still in it's purest form.<br>

Through each step within the provided jupyter file, we will slowly convert the raw bson data into plain json data that also contains cleaned twitter content.<br>

<b>In this case, cleaned data means removing symbols that will affect data processing such as the escape symbol, non-unicode symbols, etc. </b>

As there will be multiple steps in the conversion, multiple output files are to be expected within the "out" directory. This document will explain what each file is.<br>

| File Name                  | From Program      | Description                                                                                                                                |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| dump/prod/posts-main.bson  | mongodump command | Rawest form of data straight from mongodump command                                                                                        |
| out/dump-raw.json          | cleaning.ipynb    | Raw data dumped as is from the mongodb bson data. This file still contains non-primitive types such as the ObjectId, datetime, etc         |
| out/dump-formatted.json    | cleaning.ipynb    | Proper JSON data that has been converted from the previous mongodb specific types. Only contains primitive types such as string and number |
| out/cleaned-formatted.json | cleaning.ipynb    | Proper file structure, text cleaned while still leaving in important usable tokens such as hashtags                                        |
