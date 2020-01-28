const config = require("./cwops_beginner.json")
const fs = require("fs")
const path = require("path")
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const exec = promisify(require('child_process').exec);

const MorseCWWave = require("morse-pro/lib/morse-pro-cw-wave").default
const riffwave = require("morse-pro/lib/morse-pro-util-riffwave").getData


function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

// Get a large list of random words back, separated by
// space, phrases separated by <BT>
function randomWords(wordList, repetition, targetLength) {
  let words = []
  while (words.join("").length < targetLength) {
    words = words.concat(wordList)
  }
  words = shuffle(words)
  let content = ""
  for (let i=0; content.length < targetLength; i++) {
    let repeated = ""
    for (let j=0; j < repetition; j++) {
      repeated = repeated + " " + words[i]
    }
    // Don't repeat phrasing prosign breaks on repetition eg: <BT> foo <BT> <BT> foo
    content = content + repeated.replace(/\<BT\>\s\<BT\>/g, "<BT>")
  }
  return content
}

function icrtGroups(chars, groupSize, targetLength) {
  let content = []
  while (content.length < targetLength) {
    content = content.concat(chars)
  }
  content = shuffle(content)
  let out = ""
  for (let i=0; i<content.length; i=i+groupSize) {
    const group = content.slice(i, i+groupSize)
    if (group.length === groupSize) {
      out = out + ' ' + group.join('')
    }
  }
  return out
}

function buildSegmentPractice(segment) {
  let words = []
  words = words.concat(segment["words"])
  words = words.concat(segment["callsigns"])
  for (let i=0; i < segment["phrases"].length; i++) {
    words = words.concat("<BT> " + segment["phrases"][i] + " <BT>")
  }
  return words
}

async function createAudioFile(content, out, wpm, farnsworth) {
  const morseCWWave = new MorseCWWave(true, wpm, farnsworth)
  const outFileWav = `${out}.wav`
  const outFileMP3 = `${out}.mp3`
  morseCWWave.translate(content)
  await writeFile(outFileWav,
    Buffer.from(riffwave(morseCWWave.getSample()))
  )
  console.log(`Written ${outFileWav}`)
  // TODO: Error check this
  let { stdout, stderr } = await exec(`ffmpeg -i ${outFileWav} -y -codec:a libmp3lame -b:a 160k ${outFileMP3}`)
  await unlink(outFileWav)
  console.log(`Compressed ${outFileMP3}`)
}

async function buildAudioFiles(config) {
  const segmentFiles = await readdir(config.output.segmentDir)
  for (let j=0; j<config.output.segmentSpeeds.length; j++) {
    const [wpm, fwpm] = config.output.segmentSpeeds[j]
    console.info(`Creating Segment audio for ${wpm} wpm at farnsworth speed of ${fwpm}`)

    for (let i = 0; i < segmentFiles.length; i++) {
      const file = path.join(config.output.segmentDir, segmentFiles[i])
      const out = path.join(config.output.segmentDir, segmentFiles[i]).replace(/\.txt$/, `_${wpm}@${fwpm}`)

      const content = await readFile(file, 'utf-8')
      await createAudioFile(content, out, wpm, fwpm)
    }
  }

  const icrtFiles = await readdir(config.output.icrtDir)
  for (let j=0; j<config.output.icrtSpeeds.length; j++) {
    const [wpm, fwpm] = config.output.icrtSpeeds[j]
    console.info(`Creating ICRT audio for ${wpm} wpm at farnsworth speed of ${fwpm}`)

    for (let i = 0; i < icrtFiles.length; i++) {
      const file = path.join(config.output.icrtDir, icrtFiles[i])
      const out = path.join(config.output.icrtDir, icrtFiles[i]).replace(/\.txt$/, `_${wpm}@${fwpm}`)

      const content = await readFile(file, 'utf-8')
      await createAudioFile(content, out, wpm, fwpm)
    }
  }
}

async function buildTextFiles(config) {
  await mkdir(config.output.segmentDir, {recursive: true})
  await mkdir(config.output.icrtDir, {recursive: true})
  // for (let i=0; i<1; i++) {
  for (let i=0; i<config.segments.length; i++) {
    const segment = config.segments[i]

    // Words, phrases and callsigns
    const repetitive = randomWords(buildSegmentPractice(segment), config.repetition, config.targetSegmentLength)
    const single = randomWords(buildSegmentPractice(segment), 1, config.targetSegmentLength)

    const repetitivePath = path.join(config.output.segmentDir, `segment_${segment.name}_${config.repetition}x.txt`)
    const singlePath = path.join(config.output.segmentDir, `segment_${segment.name}_1x.txt`)
    await writeFile(repetitivePath, repetitive);
    await writeFile(singlePath, single);


    // Instant Character Recognition training
    const chars = segment.characters
    const charsCumulative = config.segments.map(function(seg, idx) {
      if(idx<=i) {return seg.characters}
      return []
    }).flat()

    const icrtPath = path.join(config.output.icrtDir, `icrt_${segment.name}_new.txt`)
    const icrtCumulativePath = path.join(config.output.icrtDir, `icrt_${segment.name}_all.txt`)
    await writeFile(icrtPath, icrtGroups(chars, 5, config.targetICRTLength));
    await writeFile(icrtCumulativePath, icrtGroups(charsCumulative, 5, config.targetICRTLength));
  }
  console.info("file created successfully with promisify and async/await!");
}

async function main(config) {
  await buildTextFiles(config)
  await buildAudioFiles(config)
}

main(config).catch(error => console.error(error));
