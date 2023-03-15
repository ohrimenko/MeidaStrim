// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/acolwell/mse-tools/ebml"
	"github.com/acolwell/mse-tools/isobmff"
	"github.com/acolwell/mse-tools/webm"
)

var sizeIn int64 = 0

type isobmffClient struct {
	foundInitSegment   bool
	mediaSegmentOffset int64
	manifest           *JSONManifest
}

func (c *isobmffClient) OnHeader(offset int64, hdr []byte, id string, size int64) bool {
	fmt.Printf("OnHeader(%d, %s, %d)\n", offset, id, size)
	if offset == 0 && id != "ftyp" {
		fmt.Printf("File must start with a 'ftyp' box\n")
		return false
	}

	if id == "moov" {
		if c.foundInitSegment {
			fmt.Printf("Multiple 'moov' boxes not supported\n")
			return false
		}
	} else if id == "moof" {
		if !c.foundInitSegment {
			fmt.Printf("'moof' boxes must come after the 'moov' box.\n")
			return false
		}
		c.mediaSegmentOffset = offset
	} else if id == "mdat" {
		if c.mediaSegmentOffset == -1 {
			fmt.Printf("'mdat' boxes must come after the 'moof' box.\n")
			return false
		}
	}

	return true
}

func (c *isobmffClient) OnBody(offset int64, body []byte) bool {
	//fmt.Printf("OnBody(%d, %d)\n", offset, len(body))
	return true
}

func (c *isobmffClient) OnElementEnd(offset int64, id string) bool {
	fmt.Printf("OnElementEnd(%d, %s)\n", offset, id)

	if id == "moov" {
		c.foundInitSegment = true
		c.manifest.Init = &InitSegment{Offset: 0, Size: offset}
	} else if id == "mdat" {
		/*
			c.manifest.Media = append(c.manifest.Media, &MediaSegment{
				Offset:   c.mediaSegmentOffset,
				Size:     (offset - c.mediaSegmentOffset),
				Timecode: float64(-1),
			})
		*/

		infoOut(fmt.Sprintf("%d,%.3f", c.mediaSegmentOffset, float64(-1)), "media")

		c.mediaSegmentOffset = -1
	}
	return true
}

func (c *isobmffClient) OnEndOfData(offset int64) {
	fmt.Printf(c.manifest.ToJSON())
}

func newISOBMFFClient() *isobmffClient {
	return &isobmffClient{
		foundInitSegment:   false,
		mediaSegmentOffset: -1,
		manifest:           NewJSONManifest(),
	}
}

func NewISOBMFFParser() *isobmff.Parser {
	return isobmff.NewParser(newISOBMFFClient())
}

type InitSegment struct {
	Offset int64
	Size   int64
}

type MediaSegment struct {
	Offset   int64
	Size     int64
	Timecode float64
}

type JSONManifest struct {
	Size      uint64
	Type      string
	Width     uint64
	Height    uint64
	Bitrate   int64
	Duration  float64
	StartDate time.Time
	Init      *InitSegment
	Media     []*MediaSegment
}

func (jm *JSONManifest) ToJSON() string {
	str := "{"
	str += "\"type\": \"" + strings.Replace(jm.Type, "\"", "\\\"", -1) + "\","
	str += fmt.Sprintf("\"size\": %d,", sizeIn)

	if jm.Width > 0 && jm.Height > 0 {
		str += fmt.Sprintf("\"width\": %d,", jm.Width)
		str += fmt.Sprintf("\"height\": %d,", jm.Height)
	}

	if jm.Bitrate > 0 {
		str += fmt.Sprintf("\"bitrate\": %f,", jm.Bitrate)
	}

	if jm.Duration == -1 {
		str += "\"live\": true,"
	} else {
		str += fmt.Sprintf("\"duration\": %f,", jm.Duration)
	}

	if !jm.StartDate.IsZero() {
		str += "\"startDate\": " + jm.StartDate.Format(time.RFC3339Nano) + ", "
	}

	str += fmt.Sprintf("\"init\": [%d,%d],",
		jm.Init.Offset,
		jm.Init.Size)
	str += "\"media\": ["
	for i := range jm.Media {
		m := jm.Media[i]
		str += fmt.Sprintf("[%d,%.3f]",
			m.Offset,
			//m.Size,
			m.Timecode)
		if i+1 != len(jm.Media) {
			str += ","
		}
		str += ""
	}
	str += "]"
	str += "}"
	return str
}

func NewJSONManifest() *JSONManifest {
	return &JSONManifest{Type: "",
		Duration: -1,
		Init:     nil,
		Media:    []*MediaSegment{},
	}
}

type Parser interface {
	Append(buf []byte) bool
	EndOfData()
}

type webMClient struct {
	vcodec          string
	acodec          string
	timecodeScale   uint64
	duration        float64
	headerOffset    int64
	headerSize      int64
	clusterOffset   int64
	clusterSize     int64
	clusterTimecode uint64
	manifest        *JSONManifest
}

func (c *webMClient) OnListStart(offset int64, id int) bool {
	//fmt.Printf("OnListStart(%d, %s)\n", offset, webm.IdToName(id))

	if id == ebml.IdHeader {
		if c.headerSize != -1 {
			return false
		}
		c.headerOffset = offset
		c.headerSize = -1
		c.vcodec = ""
		c.acodec = ""
	} else if id == webm.IdCluster {
		if c.headerSize == -1 {
			c.headerSize = offset - c.headerOffset

			infoOut("type:"+c.manifest.Type, "stat")
			infoOut(fmt.Sprintf("size:%d", sizeIn), "stat")
			if c.manifest.Width > 0 {
				infoOut(fmt.Sprintf("width:%d", c.manifest.Width), "stat")
			}
			if c.manifest.Height > 0 {
				infoOut(fmt.Sprintf("height:%d", c.manifest.Height), "stat")
			}
			if c.manifest.Duration == -1 {
				infoOut("live:true", "stat")
			} else {
				infoOut(fmt.Sprintf("duration:%.3f", c.manifest.Duration), "stat")
			}

			if !c.manifest.StartDate.IsZero() {
				infoOut("startDate:"+c.manifest.StartDate.Format(time.RFC3339Nano), "stat")
			}

			c.manifest.Init = &InitSegment{Offset: c.headerOffset, Size: c.headerSize}

			infoOut(fmt.Sprintf("init:%d,%d", c.manifest.Init.Offset, c.manifest.Init.Size), "init")

			infoOut("", "media")
			infoOut("", "media")
		}
		c.clusterOffset = offset
	}
	return true
}

func (c *webMClient) OnListEnd(offset int64, id int) bool {
	//fmt.Printf("OnListEnd(%d, %s)\n", offset, webm.IdToName(id))
	scaleMult := float64(c.timecodeScale) / 1000000000.0

	if id == webm.IdInfo {
		if c.timecodeScale == 0 {
			c.timecodeScale = 1000000
		}
		if c.duration != -1 {
			c.manifest.Duration = c.duration * scaleMult
		}
		return true
	}

	if id == webm.IdTracks {
		contentType := ""
		if c.vcodec != "" && c.acodec != "" {
			contentType = fmt.Sprintf("video/webm;codecs=\"%s,%s\"", c.vcodec, c.acodec)
		} else if c.vcodec != "" && c.acodec == "" {
			contentType = fmt.Sprintf("video/webm;codecs=\"%s\"", c.vcodec)
		} else if c.vcodec == "" && c.acodec != "" {
			contentType = fmt.Sprintf("audio/webm;codecs=\"%s\"", c.acodec)
		}

		c.manifest.Type = contentType

		return true
	}

	if id == webm.IdCluster {
		/*
			c.manifest.Media = append(c.manifest.Media, &MediaSegment{
				Offset:   c.clusterOffset,
				Size:     (offset - c.clusterOffset),
				Timecode: (float64(c.clusterTimecode) * scaleMult),
			})
		*/

		infoOut(fmt.Sprintf("%d,%.3f", c.clusterOffset, (float64(c.clusterTimecode)*scaleMult)), "media")
		return true
	}

	if id == webm.IdSegment {
		//fmt.Printf(c.manifest.ToJSON())
	}
	return true
}

func (c *webMClient) OnBinary(id int, value []byte) bool {
	return true
}

func (c *webMClient) OnInt(id int, value int64) bool {
	return true
}

func (c *webMClient) OnUint(id int, value uint64) bool {
	if id == webm.IdTimecodeScale {
		c.timecodeScale = value
		return true
	}
	if id == webm.IdTimecode {
		c.clusterTimecode = value
		return true
	}
	if id == webm.IdDateUTC {
		c.manifest.StartDate = time.Date(2001, time.January, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(value))

		return true
	}

	if id == webm.IdPixelWidth {
		c.manifest.Width = value
	}

	if id == webm.IdPixelHeight {
		c.manifest.Height = value
	}

	return true
}

func (c *webMClient) OnFloat(id int, value float64) bool {
	if id == webm.IdDuration {
		c.manifest.Duration = value
	}
	return true
}

func (c *webMClient) OnString(id int, value string) bool {
	if id == webm.IdCodecID {
		switch value {
		case "V_VP8":
			c.vcodec = "vp8"
			break
		case "V_VP9":
			c.vcodec = "vp9"
			break
		case "A_VORBIS":
			c.acodec = "vorbis"
			break
		case "A_OPUS":
			c.acodec = "opus"
			break
		}
	}

	return true
}

func newWebMClient() *webMClient {
	return &webMClient{
		vcodec:          "",
		acodec:          "",
		timecodeScale:   0,
		duration:        -1,
		headerOffset:    -1,
		headerSize:      -1,
		clusterOffset:   -1,
		clusterTimecode: 0,
		manifest:        NewJSONManifest(),
	}
}

func NewWebMParser() *ebml.Parser {
	c := newWebMClient()

	return ebml.NewParser(ebml.GetListIDs(webm.IdTypes()), webm.UnknownSizeInfo(),
		ebml.NewElementParser(c, webm.IdTypes()))
}

var isStat bool = false
var isInit bool = false
var isMedia bool = false

func infoOut(str string, tn string) {
	if tn == "stat" && !isInit && !isMedia {
		isStat = true
		fmt.Print(str + "\n")
	}
	if tn == "init" && !isInit && !isMedia {
		isInit = true
		fmt.Print(str + "\n")
	}
	if tn == "media" && isStat && isInit {
		isMedia = true
		fmt.Print(str + "\n")
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <infile>\n", os.Args[0])
		return
	}

	var in io.Reader = nil

	if os.Args[1] == "-" {
		in = os.Stdin
	} else if strings.HasPrefix(os.Args[1], "http://") || strings.HasPrefix(os.Args[1], "https://") {
		resp, err := http.Get(os.Args[1])
		if err != nil {
			log.Printf("can't open url; err=%s\n", err.Error())
			os.Exit(1)
		}
		in = resp.Body
		sizeIn = resp.ContentLength
	} else {
		f, err := os.Open(os.Args[1])

		if f == nil {
			log.Printf("can't open file; err=%s\n", err.Error())
			os.Exit(1)
		}

		fi, err := f.Stat()
		if err != nil {
			log.Printf("Stat; err=%s\n", err.Error())
			os.Exit(1)
		}

		sizeIn = fi.Size()

		in = f
	}

	buf := [4096]byte{}

	isSize := false

	if sizeIn == 0 {
		isSize = true
	}

	var parser Parser = nil
	for done := false; !done; {
		bytesRead, err := in.Read(buf[:])
		if err == io.EOF || err == io.ErrClosedPipe {
			done = true
			continue
		}

		if isSize {
			sizeIn += int64(bytesRead)
		}

		if parser == nil {
			if len(buf) < 8 {
				log.Printf("Not enough bytes to detect file type.\n")
				break
			} else if binary.BigEndian.Uint32(buf[0:4]) == 0x1a45dfa3 {
				parser = NewWebMParser()
			} else if bytes.NewBuffer(buf[4:8]).String() == "ftyp" {
				parser = NewISOBMFFParser()
			}

			if parser == nil {
				log.Printf("Unknown file type.\n")
				break
			}
		}

		if !parser.Append(buf[0:bytesRead]) {
			log.Printf("Parse error\n")
		}
	}

	if parser != nil {
		parser.EndOfData()
	}
}
