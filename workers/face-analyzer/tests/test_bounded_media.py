from __future__ import annotations
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import importlib.util,sys,tempfile,unittest
from face_analyzer.media import iter_sampled_frames

class BoundedDecodeTests(unittest.TestCase):
    def test_decoder_seeks_skips_preroll_and_stops_without_converting_later_frames(self):
        converted=[]
        class Frame:
            time_base=Fraction(1,1000)
            width=64;height=64
            def __init__(self,pts):self.pts=pts
            def to_ndarray(self,**kwargs):converted.append(self.pts);return 'pixels'
        class Container:
            streams=[SimpleNamespace(type='video',time_base=Fraction(1,1000))]
            def seek(self,offset,**kwargs):self.offset=offset
            def decode(self,stream):
                for pts in [59000,60000,61000,62000,64000,65000]:yield Frame(pts)
                raise AssertionError('decoder read beyond end of requested interval')
            def close(self):pass
        container=Container()
        with patch.dict(sys.modules,{'av':SimpleNamespace(open=lambda _:container)}):
            frames=list(iter_sampled_frames('fixture',sample_interval_ms=2000,start_ms=60000,end_ms=65000))
        self.assertEqual(container.offset,60000)
        self.assertEqual(converted,[60000,62000,64000])
        self.assertEqual([f.pts_ms for f in frames],[60000,62000,64000])

    @unittest.skipUnless(importlib.util.find_spec('av') and importlib.util.find_spec('numpy'),'real decoder is verified in the worker image')
    def test_real_decoder_seeks_in_synthetic_video(self):
        import av,numpy as np
        with tempfile.TemporaryDirectory() as directory:
            path=str(Path(directory)/'synthetic.mp4')
            with av.open(path,'w') as output:
                stream=output.add_stream('mpeg4',rate=10);stream.width=64;stream.height=64;stream.pix_fmt='yuv420p'
                for index in range(100):
                    frame=av.VideoFrame.from_ndarray(np.full((64,64,3),index,dtype=np.uint8),format='rgb24')
                    for packet in stream.encode(frame):output.mux(packet)
                for packet in stream.encode():output.mux(packet)
            frames=list(iter_sampled_frames(path,sample_interval_ms=500,start_ms=6000,end_ms=7000))
            self.assertEqual([frame.pts_ms for frame in frames],[6000,6500])

if __name__=='__main__':unittest.main()
