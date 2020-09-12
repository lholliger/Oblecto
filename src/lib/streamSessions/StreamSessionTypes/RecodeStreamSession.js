import StreamSession from '../StreamSession';
import ffmpeg from '../../../submodules/ffmpeg';
import Stream from 'stream';

export default class RecodeStreamSession extends StreamSession {
    constructor(file, options, oblecto) {
        super(file, options, oblecto);

        if (this.videoCodec === this.file.videoCodec) {
            this.videoCodec = 'copy';
        }

        if (this.audioCodec === this.file.audioCodec) {
            this.audioCodec = 'copy';
        }

        this.inputStream = new Stream.PassThrough;
        this.outputStream = new Stream.PassThrough;
    }

    async addDestination(destination) {
        this.destinations.push(destination);
        this.outputStream.pipe(destination.stream);

        let _this = this;

        destination.stream
            .on('error', (err) => {
                console.log(err);
            })
            .on('close', function () {
                for (let i in _this.destinations) {
                    if (_this.destinations[i].stream === this) {
                        _this.destinations.splice(i, 1);
                    }
                }

                if (_this.destinations.length === 0) {
                    _this.outputStream.destroy();
                }
            });
    }

    async startStream() {
        await super.startStream();

        if (this.started) return;

        this.started = true;

        let process = ffmpeg(this.file.path)
            //.native()
            .format(this.format)
            .videoCodec(this.getFfmpegVideoCodec())
            .audioCodec(this.audioCodec)
            .seekInput(this.offset)
            .inputOptions([
                '-noaccurate_seek',
            ])
            .outputOptions([
                '-movflags', 'empty_moov',
                '-copyts',
            ])
            .on('start', (cmd) => {
                console.log('--- ffmpeg start process ---');
                console.log(`cmd: ${cmd}`);
            })
            .on('end', () => {
                console.log('--- end processing ---');
            });

        process.on('error', (err) => {
            console.log('--- ffmpeg meets error ---');
            console.log(err);
            process.kill();

            this.emit('close');
        });

        process.pipe(this.outputStream, {end: true});
    }


    getFfmpegVideoCodec() {
        let codec = this.videoCodec;

        let codecs = {
            'h264': 'libx264'
        };

        if (codecs[codec]) codec = codecs[codec];

        return codec;
    }
}
